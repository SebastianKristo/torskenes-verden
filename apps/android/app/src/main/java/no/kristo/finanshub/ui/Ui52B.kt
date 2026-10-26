package no.kristo.finanshub.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Card52
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.Screen
import no.kristo.finanshub.kalWidget
import no.kristo.finanshub.loadBirthdays24
import no.kristo.finanshub.loadBrief52
import no.kristo.finanshub.loadChar52
import no.kristo.finanshub.loadCharAdmin52
import no.kristo.finanshub.loadKal26
import no.kristo.finanshub.logos52
import no.kristo.finanshub.openBirthdays24
import no.kristo.finanshub.openKal26
import no.kristo.finanshub.prefetchRuter52
import no.kristo.finanshub.refreshHomeDeps27
import no.kristo.finanshub.loadTrials31
import no.kristo.finanshub.seedHome52
import no.kristo.finanshub.seedRuter52
import no.kristo.finanshub.setCharDefault52
import no.kristo.finanshub.startService52
import no.kristo.finanshub.trialDays32b
import no.kristo.finanshub.vaerKey52
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalDateTime
import kotlin.math.abs
import kotlin.math.roundToInt

/*
 * Prompt 52 (AND52B) – grensesnittet:
 *  - Effects52B: forhåndshenting av Ruter (oppstart, hvert 60. s i forgrunnen, retur fra bakgrunn), Vær nå-bildet ved ny time/værtype,
 *    figuren per bruker (glimt_char) og Blekksprut-bildet.
 *  - PgIn52/PgBase52 (fasit pgAnim/pgIn): ny side glir inn 18 dp fra høyre med fade (260 ms), tilbake gir 12 dp fra venstre (220 ms).
 *    Ingen animasjon med «Fjern animasjoner».
 *  - Hjem 3a: 2-kolonners rutenett; Avgang, Finans, Middag, Familie og Domener er egne kort (h52av … h52do) som kan flyttes og skjules
 *    i redigeringsmodus (Avgang dobbelt høy). Kalender, Bursdag, Bolig og Prøve er halve fliser, Siste nytt og Media fulle.
 *    Lagrede oppsett: flisene står der «Fliser» (hm) sto (AppViewModel.pageOrder).
 *  - Siste nytt: hele flisen åpner nyhetsleseren, med kort vibrasjon.
 *  - LiquidTextSeg52: glass-pillen som kan dras (Faktisk/Føles som, lagvelgeren i værkartet).
 *  - BriefCards52: de ni brief-kortene for den som er logget inn (GET /api/brief52), Start-knapp for Homelab (admin).
 *  - CharAdmin52: admin setter standardfigur per bruker.  - StoreLogo52: butikklogo fra serverens lokale logo-cache.
 */

private val EASE52 = CubicBezierEasing(.2f, .8f, .2f, 1f)

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
    LaunchedEffect(Unit) { while (true) { delay(60_000); vaerCheck52(vm) } }
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
    vm.p46.kart.open, vm.p31.nordOpen, vm.p34.briefOpen, vm.p35.glimtOpen, vm.p34.aiOpen, vm.newsOpen,
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

/* ======================= Hjem 3a ======================= */

internal val TILE_KEYS52 = listOf("h52av", "h52fi", "h52ma", "h52fa", "h52do")
private val TILE_LABELS52 = mapOf("h52av" to "Avgang", "h52fi" to "Finans", "h52ma" to "Middag", "h52fa" to "Familie", "h52do" to "Domener")
/** Halve fliser på telefon (fasit: h7, h9, h10, h11 og h13–h17 får grid-column auto). */
internal val HALF52 = setOf("h7", "h9", "h10", "h11") + TILE_KEYS52

/** Kortlista for 3a: «Fliser» (hm) erstattes av de fem flisene som egne kort på samme plass. */
internal fun homeSecs52(secs: List<PSec>): List<PSec> = secs.flatMap { s -> if (s.key == "hm") TILE_KEYS52.map { PSec(it, TILE_LABELS52.getValue(it)) } else listOf(s) }

/**
 * Hjem: med [g52] (telefon, «Hjem som fliser» på) 2 kolonner der halve fliser står side om side og Avgang er dobbelt høy
 * med de to neste halve flisene oppå hverandre ved siden av. Ellers som før (pageGridSecs).
 */
internal fun LazyGridScope.homeGridSecs52(vm: AppViewModel, g52: Boolean, secs0: List<PSec>, wide: Boolean, skip: (String) -> Boolean = { false }, body: @Composable (String) -> Unit) {
    if (!g52) { pageGridSecs(vm, "hjem", secs0, wide, skip, body); return }
    val page = "hjem"
    val secs = homeSecs52(secs0)
    val keys = secs.map { it.key }
    val edit = vm.editPage == page
    vm.b28.pageSecs[page] = secs.map { it.key to it.label }
    val order0 = vm.pageLayouts[page]?.order ?: emptyList()
    // «Fliser» var skjult i et lagret oppsett (og flisene er ikke plassert ennå): de fem er skjult også.
    val hid = vm.pageHidden(page).let { h -> if ("hm" in h && TILE_KEYS52.none { it in order0 }) h + TILE_KEYS52 else h }
    val shown0 = vm.pageOrder(page, keys).filter { it !in hid }
    // Med Avgang-flisen vises ikke Avganger-kortet (h3), med Familie-flisen ikke Posisjon (h6) – som før med flisene.
    val skip52: (String) -> Boolean = { k -> skip(k) || (k == "h3" && "h52av" in shown0) || (k == "h6" && "h52fa" in shown0) }
    val vis = shown0.filter { edit || !skip52(it) }
    if (edit) item(key = "edit-$page", span = { GridItemSpan(maxLineSpan) }) { WiggleSpace30(true, extra = (-10).dp) }
    var i = 0
    while (i < vis.size) {
        val k = vis[i]
        val idx = i
        if (k == "h52av") {
            val nx = vis.drop(i + 1).takeWhile { it in HALF52 && it != "h52av" }.take(2)
            val h = if (nx.size == 2) TILE_H52 * 2 + 10.dp else 212.dp
            item(key = "sec-$page-$k", span = { GridItemSpan(1) }) {
                EditWrap(vm, page, secs.first { it.key == k }, keys, idx, vis.size) { Tile52(vm, k, h) }
            }
            if (nx.isNotEmpty()) item(key = "col52-" + nx.joinToString("-"), span = { GridItemSpan(1) }) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    nx.forEachIndexed { j, x ->
                        EditWrap(vm, page, secs.first { it.key == x }, keys, idx + 1 + j, vis.size) { Tile52(vm, x, if (nx.size == 2) TILE_H52 else h, body) }
                    }
                }
            }
            i += 1 + nx.size
            continue
        }
        val half = k in HALF52
        item(key = "sec-$page-$k", span = { GridItemSpan(if (half) 1 else maxLineSpan) }) {
            EditWrap(vm, page, secs.first { it.key == k }, keys, idx, vis.size) { if (half || k == "h5") Tile52(vm, k, TILE_H52, body) else body(k) }
        }
        i++
    }
    if (!edit) item(key = "hint-$page", span = { GridItemSpan(maxLineSpan) }) { EditHint() }
}

private val TILE_H52 = 150.dp
private val SHAPE52 = RoundedCornerShape(24.dp)

/** Én flis i 3a. Prompt 70 (ANDHOME70): h = Dp.Unspecified → innholdets høyde (raden i Home70.kt strekker begge likt). */
@Composable
internal fun Tile52(vm: AppViewModel, k: String, h: Dp, body: @Composable (String) -> Unit = {}) {
    val m = if (h == Dp.Unspecified) Modifier.fillMaxWidth().fillMaxHeight() else Modifier.fillMaxWidth().height(h)
    when (k) {
        "h52av" -> {
            LaunchedEffect(Unit) { while (true) { delay(30_000); if (!vm.ruterOpen && vm.b27.homeStops?.isNotEmpty() == true) runCatching { vm.refreshHomeDeps27() } } }
            AvgangTile50(vm, tileDeps50(vm), m)
        }
        "h52fi" -> FinTile50(vm, m)
        "h52ma" -> MatTile50(vm, m)
        "h52fa" -> { LaunchedEffect(Unit) { while (true) { vm.loadPositions(); delay(60_000) } }; FamTile50(vm, m) }
        "h52do" -> DomTile50(vm, m)
        "h10" -> KalTile52(vm, m)
        "h9" -> BdTile52(vm, m)
        "h7" -> BoligTile52(vm, m)
        "h11" -> TrialTile52(vm, m)
        "h5" -> NewsTile52(vm)
        else -> Box(m) { body(k) }
    }
}

@Composable
private fun TLabel52(text: String, color: Color) =
    Text(text.uppercase(), color = color, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, letterSpacing = 1.2.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)

@Composable
private fun TileBox52(bg: Color, label: String, modifier: Modifier, onClick: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.clip(SHAPE52).background(bg).then(if (Tone.glass) glassEdge50(SHAPE52) else Modifier)
            .clickable(role = Role.Button, onClickLabel = "Åpne $label", onClick = onClick).padding(16.dp, 14.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) { content() }
}

/** Varme (Bursdag) og mørke (Prøve) flisfarger som Middag og Avgang. */
private class TCol52(val bg: Color, val ink: Color, val lab: Color)
private val warm52: TCol52 get() = when { Tone.glass -> TCol52(Color(0x2EFF7A3D), Color.White, Color(0xFFFFB08A)); Tone.paperDark -> TCol52(Color(0xFF452C17), Color(0xFFF4E3CF), Color(0xFFF2C38F)); else -> TCol52(Color(0xFFF4E3CF), Color(0xFF3A2410), Color(0xFF8A4F12)) }
private val dark52: TCol52 get() = when { Tone.glass -> TCol52(Color(0x12FFFFFF), Color.White, Color(0xFFA9A397)); Tone.paperDark -> TCol52(Color(0xFF0F0E0C), Color(0xFFF3EFE6), Color(0xFFA9A397)); else -> TCol52(Color(0xFF1B1A17), Color(0xFFF3EFE6), Color(0xFFA9A397)) }

@Composable
private fun minute52(): LocalDateTime {
    var now by remember { mutableStateOf(LocalDateTime.now()) }
    LaunchedEffect(Unit) { while (true) { delay(60_000L - LocalDateTime.now().second * 1000L + 200L); now = LocalDateTime.now() } }
    return now
}

@Composable
private fun KalTile52(vm: AppViewModel, m: Modifier) {
    val p = PaperPal.current
    val s = vm.kal26
    LaunchedEffect(vm.base) { if (s.events == null) vm.loadKal26(quiet = true) }
    val now = minute52()
    val w = kalWidget(s.events ?: emptyList(), now, s.subjectColors)
    TileBox52(p.card, "Kalender", m, { Haptics.tap(); vm.openKal26(w.evId) }) {
        TLabel52("Kalender · " + w.k, p.lab)
        Spacer(Modifier.weight(1f))
        if (s.events == null) Text("Henter …", color = p.mut, fontSize = 13.sp)
        else {
            PSerif(w.title, 20.sp, p.ink, maxLines = 2)
            Text(listOf(w.big, w.whenText).filter { it.isNotBlank() }.joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun BdTile52(vm: AppViewModel, m: Modifier) {
    val c = warm52
    LaunchedEffect(vm.base) { if (vm.bd24.items == null) vm.loadBirthdays24(quiet = true) }
    val l = (vm.bd24.items ?: emptyList()).take(3)
    TileBox52(c.bg, "Bursdager", m, { Haptics.tap(); vm.openBirthdays24() }) {
        TLabel52("Bursdag", c.lab)
        if (l.isNotEmpty()) Box(Modifier.padding(top = 6.dp).height(32.dp)) {
            l.forEachIndexed { i, b -> Box(Modifier.padding(start = (i * 24).dp).size(32.dp).clip(CircleShape).background(c.bg).padding(2.dp)) { BdAvatar(vm, b, 28) } }
        }
        Spacer(Modifier.weight(1f))
        val f = l.firstOrNull()
        PSerif(f?.let { it.name.substringBefore(' ') + " " + it.whenText.lowercase() } ?: if (vm.bd24.items == null) "Henter …" else "Ingen ennå", 20.sp, c.ink, maxLines = 1)
        Text(f?.let { listOfNotNull(it.age?.let { a -> "fyller $a" }, it.short).joinToString(" · ") } ?: "Legg til bursdager", color = c.lab, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1)
    }
}

@Composable
private fun BoligTile52(vm: AppViewModel, m: Modifier) {
    val p = PaperPal.current
    val b = vm.homeBolig
    TileBox52(p.card, "Bolig", m, { Haptics.tap(); vm.paperTab("fin"); vm.openFromMer(Screen.Folders); b?.id?.toIntOrNull()?.let { vm.openFolder(it) } }) {
        TLabel52("Bolig", p.mut)
        Spacer(Modifier.weight(1f))
        if (b == null) Text("Utgifter og kvitteringer for boligen", color = p.mut, fontSize = 12.5.sp, maxLines = 3)
        else {
            PSerif("${n0(b.spent)} kr", 26.sp, p.ink, maxLines = 1)
            Text(b.budget?.let { "av ${n0(it)} kr" } ?: "brukt denne måneden", color = p.mut, fontSize = 12.sp, maxLines = 1)
            b.budget?.takeIf { it > 0 }?.let { bud ->
                Box(Modifier.padding(top = 8.dp).fillMaxWidth().height(5.dp).clip(CircleShape).background(p.line)) {
                    Box(Modifier.height(5.dp).fillMaxWidth((b.spent / bud).toFloat().coerceIn(.02f, 1f)).clip(CircleShape).background(if (b.spent > bud) p.lab else p.ink))
                }
            }
            if (b.review > 0) Text("${b.review} kvittering${if (b.review == 1) "" else "er"}", color = p.lab, fontSize = 12.sp, maxLines = 1, modifier = Modifier.padding(top = 6.dp))
        }
    }
}

@Composable
private fun TrialTile52(vm: AppViewModel, m: Modifier) {
    val c = dark52
    LaunchedEffect(vm.account?.id) { if (vm.p31.trials.isEmpty()) vm.loadTrials31() }
    val today = LocalDate.now()
    val top = vm.p31.trials.filter { it.status == "active" && trialDays32b(it.endsAt, today) >= 0 }.minByOrNull { it.endsAt }
    TileBox52(c.bg, "Prøveperioder", m, { Haptics.tap(); vm.openFromMer(Screen.Sub) }) {
        TLabel52("Prøve", Color(0xFFF29A8A))
        Spacer(Modifier.weight(1f))
        if (top == null) {
            PSerif("Ingen aktive", 22.sp, c.ink, maxLines = 1)
            Text("+ Legg til", color = c.lab, fontSize = 12.sp)
        } else {
            val d = trialDays32b(top.endsAt, today)
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                PSerif(if (d == 0) "I dag" else "$d", if (d == 0) 30.sp else 48.sp, c.ink, weight = FontWeight.Normal, maxLines = 1)
                if (d > 0) Text(if (d == 1) "dag" else "dager", color = c.lab, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.padding(bottom = 8.dp))
            }
            Text(top.service, color = c.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (top.priceAfter.isNotBlank()) Text("${top.priceAfter} etterpå", color = c.lab, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Siste nytt (3a): uansett hvor du trykker, åpner hele flisen nyhetsleseren – med en kort vibrasjon. */
@Composable
internal fun NewsTile52(vm: AppViewModel) {
    val p = PaperPal.current
    val items = vm.homeNews.ifEmpty { vm.news?.items?.take(5) ?: emptyList() }
    val top = items.firstOrNull()
    Column(
        Modifier.fillMaxWidth().clip(SHAPE52).background(p.card).then(if (Tone.glass) glassEdge50(SHAPE52) else Modifier)
            .clickable(role = Role.Button, onClickLabel = "Åpne nyhetsleseren") { Haptics.tap(); vm.openNews() }.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.fillMaxWidth()) {
            TLabel52("Siste nytt", p.mut)
            Spacer(Modifier.weight(1f))
            if (top != null) Text(feedShort(top.feed) + " · " + newsTime(top.published), color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, maxLines = 1)
        }
        if (top == null) { Text("Ingen saker ennå. Legg til kilder i nyhetsleseren.", color = p.mut, fontSize = 13.sp); return@Column }
        PSerif(top.title, 24.sp, p.ink, maxLines = 3)
        val rest = items.drop(1).take(2)
        if (rest.isNotEmpty()) Column(Modifier.fillMaxWidth()) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                rest.forEach { x ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(feedShort(x.feed), color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, maxLines = 1, modifier = Modifier.width(30.dp))
                        PSerif(x.title, 15.sp, p.ink, maxLines = 1, modifier = Modifier.weight(1f))
                    }
                }
            }
        }
        val more = items.size - 1 - rest.size
        Text(if (more > 0) "+ $more saker til ›" else "Åpne nyhetsleseren ›", color = p.mut, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp)
    }
}

/* ======================= Glass-pille som kan dras (tekst) ======================= */

/**
 * Samme glass-pille som temp/regn/vind-bryteren (LiquidSeg46), men med tekst og ulik bredde per knapp:
 * trykk virker som før; dra flytter pillen med fingeren, den strekker seg etter farten, tilpasser bredden til knappen under,
 * vibrerer lett per knapp og smetter på plass når du slipper.
 */
@Composable
internal fun LiquidTextSeg52(
    items: List<Pair<String, String>>, sel: String, onPick: (String) -> Unit, modifier: Modifier = Modifier,
    cellH: Dp = 34.dp, fontSize: TextUnit = 13.sp, padH: Dp = 12.dp, fill: Boolean = false, bg: Color = Color(0xBF0A1423),
) {
    val reduce = reduceMotion45()
    val dens = LocalDensity.current
    val xs = remember(items) { mutableStateListOf<Float>().apply { repeat(items.size) { add(0f) } } }
    val ws = remember(items) { mutableStateListOf<Float>().apply { repeat(items.size) { add(0f) } } }
    var ready by remember(items) { mutableStateOf(false) }
    val idx = items.indexOfFirst { it.first == sel }.coerceAtLeast(0)
    val px = remember { Animatable(0f) }
    val pw = remember { Animatable(0f) }
    var dragging by remember { mutableStateOf(false) }
    var hover by remember { mutableIntStateOf(idx) }
    var stretch by remember { mutableFloatStateOf(0f) }
    val scope = rememberCoroutineScope()
    val sp = if (reduce) tween<Float>(150) else spring(dampingRatio = .72f, stiffness = 520f)
    LaunchedEffect(idx, ready) {
        if (!ready || dragging) return@LaunchedEffect
        hover = idx
        if (px.value == 0f && pw.value == 0f) { px.snapTo(xs[idx]); pw.snapTo(ws[idx]) }
        else { launch { px.animateTo(xs[idx], sp) }; pw.animateTo(ws[idx], sp) }
    }
    val st by animateFloatAsState(if (dragging && !reduce) stretch else 0f, spring(stiffness = Spring.StiffnessMedium), label = "st52")
    fun cellAt(x: Float): Int {
        var best = 0; var bd = Float.MAX_VALUE
        for (i in items.indices) { val c = xs[i] + ws[i] / 2; val d = abs(c - x); if (d < bd) { bd = d; best = i } }
        return best
    }
    Box(
        modifier.clip(CircleShape).background(bg).border(1.dp, Color.White.copy(alpha = .14f), CircleShape).padding(3.dp)
            .pointerInput(items) {
                var fx = 0f
                var lastT = 0L
                detectHorizontalDragGestures(
                    onDragStart = { o -> dragging = true; fx = o.x; lastT = System.nanoTime(); hover = cellAt(fx) },
                    onDragEnd = {
                        dragging = false; stretch = 0f
                        val n = hover.coerceIn(0, items.lastIndex)
                        scope.launch { px.animateTo(xs[n], sp) }
                        scope.launch { pw.animateTo(ws[n], sp) }
                        if (items[n].first != sel) { Haptics.select(); onPick(items[n].first) }
                    },
                    onDragCancel = { dragging = false; stretch = 0f; scope.launch { px.animateTo(xs[idx], sp) }; scope.launch { pw.animateTo(ws[idx], sp) } },
                ) { ch, dx ->
                    ch.consume()
                    val total = (xs.lastOrNull() ?: 0f) + (ws.lastOrNull() ?: 0f)
                    fx = (fx + dx).coerceIn(0f, total)
                    val now = System.nanoTime()
                    val v = abs(dx) / ((now - lastT).coerceAtLeast(1_000_000L) / 1e9f)
                    lastT = now
                    stretch = (v / 4000f).coerceIn(0f, 1f)
                    val h = cellAt(fx)
                    if (h != hover) { hover = h; Haptics.select(); scope.launch { pw.animateTo(ws[h], tween(120)) } }
                    scope.launch { px.snapTo((fx - pw.value / 2).coerceIn(0f, (total - pw.value).coerceAtLeast(0f))) }
                }
            },
    ) {
        if (ready) Box(
            Modifier.offset { IntOffset(px.value.roundToInt(), 0) }.size(with(dens) { pw.value.toDp() }, cellH)
                .graphicsLayer { scaleX = 1f + .14f * st; scaleY = 1f - .1f * st }
                .shadow(6.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
                .clip(CircleShape)
                .background(Brush.verticalGradient(listOf(Color.White.copy(alpha = .34f), Color.White.copy(alpha = .16f))))
                .border(1.dp, Color.White.copy(alpha = .45f), CircleShape),
        )
        Row(if (fill) Modifier.fillMaxWidth() else Modifier, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            items.forEachIndexed { i, (k, n) ->
                val on = (if (dragging) hover else idx) == i
                Box(
                    (if (fill) Modifier.weight(1f) else Modifier).height(cellH)
                        .onGloballyPositioned { c -> xs[i] = c.positionInParent().x; ws[i] = c.size.width.toFloat(); if (ws.all { it > 0f }) ready = true }
                        .clip(CircleShape).clickable(role = Role.Button, onClickLabel = n) { if (!dragging) { Haptics.select(); onPick(k) } }.padding(horizontal = padH),
                    contentAlignment = Alignment.Center,
                ) { Text(n, color = Color.White.copy(alpha = if (on) 1f else .78f), fontWeight = FontWeight.SemiBold, fontSize = fontSize, maxLines = 1) }
            }
        }
    }
}

/* ======================= Brief-kortene ======================= */

private fun JSONObject.s(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }
private fun JSONArray?.objs(): List<JSONObject> = this?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) } } ?: emptyList()

/** De ni kortene i briefen for den som er logget inn (fast rekkefølge fra serveren; kort uten tilgang kommer ikke). */
@Composable
internal fun BriefCards52(vm: AppViewModel) {
    LaunchedEffect(vm.account?.id) { vm.loadBrief52() }
    val b = vm.p52b.brief ?: return
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        b.cards.forEach { c -> BriefCard52(vm, c) }
    }
}

@Composable
private fun BriefCard52(vm: AppViewModel, c: Card52) {
    val p = PaperPal.current
    val d = c.data
    val dark = c.id == "homelab" || c.id == "focus"
    val bg = if (dark) p.ink else p.card
    val ink = if (dark) p.bg else p.ink
    val mut = if (dark) p.bg.copy(alpha = .7f) else p.mut
    val open: (() -> Unit)? = when (c.id) {
        "todo" -> { { vm.openTasks() } }
        "trip" -> { { vm.openRuter() } }
        "bills" -> { { vm.openFromMer(Screen.Sub) } }
        "tonight" -> { { vm.p43.mediaOpen = true } }
        "domains" -> { { vm.domSection = "oversikt"; vm.go(Screen.Domains) } }
        "stocks" -> { { vm.go(Screen.Stocks) } }
        "clothes" -> { { vm.openWeather() } }
        else -> null
    }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(bg).then(if (open != null) Modifier.clickable(role = Role.Button, onClickLabel = c.title) { Haptics.tap(); open() } else Modifier)
            .padding(16.dp, 14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        TLabel52(c.title, if (dark) Color(0xFFF29A8A) else p.lab)
        if (d == null) { Text(c.error ?: "Ingen data akkurat nå", color = mut, fontSize = 13.sp); return@Column }
        when (c.id) {
            "focus" -> {
                PSerif(d.s("text") ?: "En rolig dag.", 20.sp, ink, maxLines = 4)
                d.optJSONObject("next")?.let { n -> Text(listOfNotNull(n.s("time"), n.s("title"), n.s("place")).joinToString(" · "), color = mut, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                d.s("free_from")?.let { Text("Fri fra $it", color = mut, fontSize = 12.5.sp) }
            }
            "trip" -> {
                val l = d.optJSONArray("items").objs()
                d.s("stop")?.let { Text(it, color = mut, fontSize = 12.5.sp, maxLines = 1) }
                if (l.isEmpty()) Text("Ingen avganger nå", color = mut, fontSize = 13.sp)
                l.take(3).forEach { x -> Row52(listOfNotNull(x.s("line"), x.s("dest")).joinToString(" "), x.optInt("in_min", -1).takeIf { it >= 0 }?.let { if (it == 0) "nå" else "$it min" } ?: x.s("dep") ?: "", ink, mut) }
            }
            "todo" -> {
                val l = d.optJSONArray("top").objs()
                if (l.isEmpty()) Text("Ingenting på lista", color = mut, fontSize = 13.sp)
                l.take(3).forEach { x -> Row52("☐ " + (x.s("title") ?: ""), x.s("due") ?: "", if (x.optBoolean("overdue")) p.lab else ink, mut) }
                d.optInt("open", 0).takeIf { it > 3 }?.let { Text("${it - 3} til på lista ›", color = mut, fontSize = 12.5.sp) }
            }
            "bills" -> {
                val l = d.optJSONArray("items").objs()
                if (l.isEmpty()) Text("Ingen regninger denne uka", color = mut, fontSize = 13.sp)
                l.take(4).forEach { x -> Row52(x.s("name") ?: "", listOfNotNull(x.s("amount_text"), x.optInt("days", -99).takeIf { it != -99 }?.let { if (it <= 0) "i dag" else "om $it d" }).joinToString(" · "), ink, mut) }
                d.s("sum_text")?.let { PSerif("Sum $it", 18.sp, ink, maxLines = 1) }
            }
            "clothes" -> {
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PSerif(d.optDouble("temp").takeIf { !it.isNaN() }?.let { "${it.roundToInt()}°" } ?: "–", 34.sp, ink, maxLines = 1)
                    d.optDouble("feels").takeIf { !it.isNaN() }?.let { Text("føles som ${it.roundToInt()}°", color = mut, fontSize = 12.5.sp, modifier = Modifier.padding(bottom = 6.dp)) }
                }
                PSerif(d.s("text") ?: "", 17.sp, ink, maxLines = 3)
            }
            "tonight" -> {
                val l = d.optJSONArray("items").objs()
                if (l.isEmpty()) Text("Ingenting nytt i kveld", color = mut, fontSize = 13.sp)
                l.take(3).forEach { x -> Row52(listOfNotNull(x.s("title"), x.s("subtitle")).joinToString(" · "), x.s("time") ?: "", ink, mut) }
            }
            "homelab" -> {
                val ok = d.optInt("ok", 0); val down = d.optInt("down", 0)
                PSerif(if (down == 0) "Alt kjører · $ok tjenester" else "$down nede · $ok kjører", 20.sp, ink, maxLines = 1)
                d.optJSONArray("services").objs().filter { it.s("state") != "running" }.take(4).forEach { sv ->
                    val id = sv.s("id") ?: return@forEach
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(if (sv.s("state") == "unhealthy") Color(0xFFE0A030) else Color(0xFFF08A76)))
                        Column(Modifier.weight(1f)) {
                            Text(sv.s("name") ?: id, color = ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
                            Text(if (sv.s("state") == "unhealthy") "svarer ikke" else "stoppet", color = mut, fontSize = 12.sp)
                        }
                        if (sv.optBoolean("can_start") && vm.userIsAdmin) {
                            val busy = id in vm.p52b.starting
                            Box(Modifier.height(32.dp).clip(CircleShape).background(p.bg).clickable(enabled = !busy, role = Role.Button, onClickLabel = "Start ${sv.s("name") ?: id}") { vm.startService52(id) }
                                .padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                                Text(if (busy) "Starter …" else if (sv.s("state") == "unhealthy") "Start på nytt" else "Start", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
                            }
                        }
                    }
                }
            }
            "domains" -> {
                val l = d.optJSONArray("items").objs()
                if (l.isEmpty()) Text("Alle domener er i orden", color = mut, fontSize = 13.sp)
                l.take(3).forEach { x -> Row52(x.s("name") ?: "", listOfNotNull(x.optInt("days", -1).takeIf { it >= 0 }?.let { "fornyes om $it d" }, x.optInt("ssl_days", -1).takeIf { it >= 0 }?.let { "SSL $it d" }).joinToString(" · "), ink, mut) }
            }
            "stocks" -> {
                PSerif(d.s("value_text") ?: "–", 24.sp, ink, maxLines = 1)
                d.optDouble("change_pct").takeIf { !it.isNaN() }?.let { ch -> Text((if (ch >= 0) "+" else "−") + "%.1f".format(abs(ch)).replace('.', ',') + " % i dag", color = if (ch >= 0) p.pos else p.lab, fontWeight = FontWeight.SemiBold, fontSize = 13.sp) }
                d.optJSONArray("items").objs().take(3).forEach { x ->
                    val ch = x.optDouble("change_pct")
                    Row52(x.s("name") ?: x.s("ticker") ?: "", if (ch.isNaN()) "" else (if (ch >= 0) "+" else "−") + "%.1f".format(abs(ch)).replace('.', ',') + " %", ink, mut)
                }
            }
            else -> d.s("text")?.let { PSerif(it, 17.sp, ink, maxLines = 4) }
        }
    }
}

@Composable
private fun Row52(left: String, right: String, ink: Color, mut: Color) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(left, color = ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (right.isNotBlank()) Text(right, color = mut, fontSize = 12.5.sp, maxLines = 1)
    }
}

/* ======================= Glimt-figur per bruker (admin) ======================= */

/** Innstillinger → Glimt (admin): standardfiguren per bruker, f.eks. Blekksprut. Gjelder til brukeren velger selv. */
@Composable
internal fun CharAdmin52(vm: AppViewModel) {
    if (!vm.userIsAdmin) return
    val p = PaperPal.current
    val s = vm.p52b
    LaunchedEffect(s.charAdminOpen) { if (s.charAdminOpen && s.charAdmin == null) vm.loadCharAdmin52() }
    PCard {
        Row(Modifier.fillMaxWidth().clickable(role = Role.Button) { s.charAdminOpen = !s.charAdminOpen }.padding(16.dp, 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Standardfigur per bruker", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
                Text("Figuren brukeren ser til hen velger selv", color = p.mut, fontSize = 12.5.sp)
            }
            Text(if (s.charAdminOpen) "▴" else "▾", color = p.mut, fontSize = 14.sp)
        }
        if (s.charAdminOpen) {
            val l = s.charAdmin
            if (l == null) Text("Henter brukerne …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(16.dp, 0.dp, 16.dp, 14.dp))
            else l.forEach { u ->
                Column(Modifier.fillMaxWidth().padding(16.dp, 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(u.name + if (u.source == "user") " · har valgt ${Fig35.name(u.char)}" else "", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        (listOf<String?>(null) + Fig35.IDS).forEach { id ->
                            val on = u.default == id
                            Box(Modifier.height(32.dp).clip(CircleShape).background(if (on) p.ink else p.bg).clickable(role = Role.RadioButton) { vm.setCharDefault52(u.id, id) }.padding(horizontal = 12.dp),
                                contentAlignment = Alignment.Center) { Text(id?.let { Fig35.name(it) } ?: "Ingen", color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1) }
                        }
                    }
                }
            }
        }
    }
}

/* ======================= Butikklogo (Finans → Søk/Filter) ======================= */

/** 36 dp logo foran butikknavnet: serverens lokale logo-cache (logos52), forbokstaven som reserve. */
@Composable
internal fun StoreLogo52(vm: AppViewModel, name: String, size: Dp = 36.dp) {
    val p = PaperPal.current
    val n = name.trim()
    LaunchedEffect(n) { if (n.isNotEmpty()) vm.logos52(listOf(n)) }
    val lg = vm.p52b.logos[n]
    val shape = RoundedCornerShape(size / 4)
    ServerImage(vm, lg?.url, Modifier.size(size).clip(shape).background(lg?.color?.let { Color(it) } ?: p.surf2)) {
        Text((lg?.initial ?: n.take(1)).uppercase(), color = if (lg?.color != null) Color.White else p.ink, fontWeight = FontWeight.ExtraBold, fontSize = (size.value * .4f).sp,
            modifier = Modifier.align(Alignment.Center))
    }
}

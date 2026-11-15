package no.kristo.finanshub.ui

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import no.kristo.finanshub.AppViewModel
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate
import no.kristo.felles.tid.OsloDato
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.activity.result.PickVisualMediaRequest
import androidx.compose.animation.core.animateFloat
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.zIndex
import java.time.temporal.ChronoUnit
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import java.time.format.DateTimeFormatter
import java.util.Locale
import no.kristo.finanshub.ui.designsystem.HomelabType
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.compositeOver
import no.kristo.finanshub.ui.designsystem.DsPalette
import no.kristo.finanshub.ui.designsystem.HomelabTheme

/* ---------------- Subscription OS ---------------- */

// Prompt 42: den klassiske Subscription OS-skjermen (Material You) er slettet; Papir bruker Abonnement.kt.
@Composable
internal fun SubsMobileScreen(vm: AppViewModel) {
    // Prompt 23: Papir bruker den nøyaktige kopien av Subscription OS (Abonnement.kt). Her ligger den i PaneBox (23 dp toppmarg),
    // så den løftes 23 dp for å overlappe toppbildet. Ruter Paper.kt direkte til PaperSubs23, brukes lift = 0.
    PaperSubs23(vm, WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding(), lift = 23.dp)
}

/* ---------------- Subscription OS: rediger og legg til (prompt 14) ---------------- */

private val MONTH_NAMES = listOf("januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember")

/**
 * «Neste trekk 21. oktober, deretter hvert år» ut fra dag, måned og syklus. Bare reserve uten nett: skjemaet viser serverens tekst
 * (AppViewModel.nextChargeLabel → GET /finans/api/subscriptions/next-charge, server/finans/cycles.js nextChargePreview).
 */
internal fun nextChargeText(day: Int?, month: Int?, cycle: String): String {
    val d = day?.coerceIn(1, 31) ?: return "Velg faktureringsdag"
    val now: LocalDate = OsloDato.iDag() // Q20: «i dag» i Oslo
    val next: LocalDate = if (cycle == "monthly" || month == null) {
        var x = now.withDayOfMonth(minOf(d, now.lengthOfMonth()))
        if (x.isBefore(now)) { val m = now.plusMonths(1); x = m.withDayOfMonth(minOf(d, m.lengthOfMonth())) }
        x
    } else {
        val m = month.coerceIn(1, 12)
        var x = now.withMonth(m).let { it.withDayOfMonth(minOf(d, it.lengthOfMonth())) }
        if (x.isBefore(now)) x = x.plusYears(1).let { it.withDayOfMonth(minOf(d, it.lengthOfMonth())) }
        x
    }
    val then = when (cycle) { "yearly" -> "hvert år"; "biennial" -> "hvert 2. år"; else -> "hver måned" }
    return "Neste trekk ${next.dayOfMonth}. ${MONTH_NAMES[next.monthValue - 1]}, deretter $then"
}

/** Logoen til et abonnement: egen opplastet / funnet av AI, ellers tjenestens logo fra domenet. */
@Composable
internal fun SubLogo(vm: AppViewModel, s: SubItem?, name: String, size: Int) {
    val url = s?.logoUrl
    var bmp by remember(url) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(url) { bmp = url?.let { vm.subLogo(it) } }
    val b = bmp
    if (b != null) Image(b.asImageBitmap(), name, contentScale = ContentScale.Crop, modifier = Modifier.size(size.dp).clip(RoundedCornerShape((size / 4).dp)))
    else Logo(vm, s?.domain, name.ifBlank { "?" }, HomelabTheme.colors.accent.argbLong(), size)
}

/*
 * Prompt 23: Abonnementer (Subscription OS) i Papir, nøyaktig etter Subscription OS.dc.html (variant mobile, theme papir/papirDark,
 * hide-title, nav-external). Hjem · Innsikt · Historikk ligger i fanelinja (vm.subTab), «+» i linja åpner «Legg til abonnement».
 * Hold inne 0,45 s på et kort på Hjem for å flytte kortene (subHomeOrder). «Endre abonnement»-arket i Papir-farger.
 */

/**
 * Fargene i Subscription OS, fra tokenene (HomelabTheme.colors) for gjeldende stil og modus. Før var dette egne hex-tabeller
 * for Papir lys/mørk (MT.papir / MT.papirDark) og en fast oransje; nå følger kortene også Glass.
 * acc = aksenten (oransje i Glass, blekkrødt i Papir), accDeep = mørkere aksent i stripene, off = tomme søyler og skillelinjer.
 */
private class SubTok(
    val card: Color, val card2: Color, val fg: Color, val mut: Color, val bd: Color, val chip: Color, val neg: Color, val on: Color, val onFg: Color, val sheet: Color,
    val acc: Color, val accDeep: Color, val onAcc: Color, val off: Color, val grey: Color, val ok: Color, val okSoft: Color, val warn: Color, val info: Color,
    /** Kategorifargene i designet (fyll, stripe). */
    val cats: List<Pair<Color, Color>>,
)

@Composable
private fun subTok(): SubTok {
    val c = HomelabTheme.colors
    val deep: (Color) -> Color = { lerp(it, Color.Black, .22f) }
    val k = c.category
    return SubTok(
        card = c.surfaceRaised, card2 = c.surfaceSunken, fg = c.textPrimary, mut = c.textSecondary, bd = c.line, chip = c.surfaceChip,
        neg = c.danger, on = c.textPrimary, onFg = c.surface, sheet = c.surface,
        acc = c.accent, accDeep = deep(c.accent), onAcc = c.onAccent, off = c.line, grey = c.textTertiary, ok = c.success, okSoft = c.successSoft,
        warn = c.warning, info = c.info,
        cats = listOf(c.accent, k.blue, k.amber, k.teal, k.purple).map { it to deep(it) },
    )
}
private val MON_S = listOf("Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des")
private val MON_L = listOf("januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember")
private val MON_NL = listOf("Januar", "Februar", "Mars", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Desember")

private fun kr23(v: Double) = "${n0(v)} kr"
private val sans = PaperFonts.sans
private val mono = PaperFonts.mono

private fun whenText23(date: String): String {
    val d = runCatching { LocalDate.parse(date.take(10)) }.getOrNull() ?: return date
    return when (ChronoUnit.DAYS.between(LocalDate.now(), d)) { 0L -> "I dag"; 1L -> "I morgen"; else -> "${d.dayOfMonth}. ${MON_L[d.monthValue - 1]}" }
}

/** Abonnementer i Papir. lift: løft innholdet opp når det ligger i en ramme med egen toppmarg (overlapp mot toppbildet). */
@Composable
internal fun PaperSubs23(vm: AppViewModel, navBottom: Dp, lift: Dp = 0.dp) {
    val t = subTok()
    val x = vm.subsX
    LaunchedEffect(vm.account?.id) { vm.loadSubOrder23(); vm.loadTrials31(); vm.loadSubHid37(); vm.loadUsers37() }
    // Ved bytte av fane: avslutt flytting.
    LaunchedEffect(vm.subTab) { vm.m23.subArrange = false; vm.m23.subDrag = null }
    val ctx = androidx.compose.ui.platform.LocalContext.current
    LazyColumn(
        Modifier.fillMaxSize().offset(y = -lift), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 30.dp + navBottom + lift),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // Prompt 28: «Legg til abonnement» er et ark (AddSubSheet28); «Fra skjermbilde» viser lesing og feilkort (SubShotCard28).
        if (vm.b27.shotOpen) item { SubShotCard28(vm) }
        vm.moduleError?.let { e -> item { Text(e, color = t.neg, style = HomelabType.subheadline, fontFamily = sans) } }
        if (x == null) {
            if (vm.moduleError == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = t.fg) } }
            return@LazyColumn
        }
        when (vm.subTab) {
            "ins" -> {
                item { MonthCard23(x, t) }
                x.score?.let { sc -> item { HealthCard23(x, sc, t) } }
                item { CatCard23(x, t) }
            }
            "hist" -> {
                item { AgentCard23(vm, x, t) }
                item { Text("Denne måneden", color = t.fg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.body, modifier = Modifier.padding(horizontal = 4.dp)) }
                val today = LocalDate.now().toString()
                val paid = x.thisMonth.filter { it.date.take(10) <= today }.sortedByDescending { it.date }
                if (paid.isEmpty()) item { Text("Ingen trekk ennå denne måneden.", color = t.mut, style = HomelabType.subheadline, fontFamily = sans, modifier = Modifier.padding(horizontal = 4.dp)) }
                items(paid.size) { i ->
                    val c = paid[i]
                    val s = x.item(c.id)
                    val d = runCatching { LocalDate.parse(c.date.take(10)) }.getOrNull()
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(t.card).clickable(enabled = s != null) { Haptics.select(); vm.m23.subEditId = s?.id }.padding(14.dp, 12.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        RoundLogo23(vm, s, c.name, 40)
                        Column(Modifier.weight(1f)) {
                            Text(c.name, color = t.fg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.callout, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text((d?.let { "${it.dayOfMonth}. ${MON_L[it.monthValue - 1].take(3)}" } ?: ddmm(c.date)) + (s?.category?.let { " · $it" } ?: ""), color = t.mut, fontFamily = sans, style = HomelabType.footnote, maxLines = 1)
                        }
                        Text("−" + kr23(c.amount), color = t.fg, fontFamily = mono, fontWeight = FontWeight.SemiBold, style = HomelabType.callout)
                    }
                }
                // Prompt 46 (claude-code-subscription-logg.md): logg over prøveperioder og alle tidligere fakturaer (ui/Ui46b.kt).
                item(key = "sublog46") { SubLog46(vm, t.fg, t.mut, t.card, t.ok) }
            }
            else -> {
                // Prompt 37: GRATIS PRØVEPERIODER er et eget kort i rekkefølgen (øverst), med wiggle-redigering av kortene.
                item { HomeCards23(vm, x, t) }
            }
        }
    }
    vm.m23.subEditId?.let { id -> x?.item(id)?.let { s -> SubSheet23(vm, s) { vm.m23.subEditId = null } } ?: run { vm.m23.subEditId = null } }
    if (vm.m23.subEditNew) SubSheet23(vm, null) { vm.m23.subEditNew = false }
    if (vm.subAdding) AddSubSheet28(vm)
}

@Composable
private fun RoundLogo23(vm: AppViewModel, s: SubItem?, name: String, size: Int, ring: Color? = null) {
    Box(Modifier.size(size.dp).then(if (ring != null) Modifier.border(2.dp, ring, CircleShape) else Modifier).padding(if (ring != null) 2.dp else 0.dp).clip(CircleShape)) {
        SubLogo(vm, s, name, size)
    }
}

/* ---------------- Hjem: kortene, med hold inne og dra ---------------- */

private val SUB_NAMES37 = mapOf("trials" to "Gratis prøveperioder", "ai" to "AI-sparing", "next7" to "Neste trekk", "check" to "Sjekk", "list" to "Kommende trekk")

/**
 * Prompt 37: wiggle-redigering som Hjem og Mer. Hold inne 450 ms: kortene vugger (±0,6°, 0,6 s, annenhver retning) med stiplet ramme,
 * − skjuler, ＋ (rødt tall) åpner «Legg til kort», Tilbakestill og Ferdig. Flytting med krasjfiksen: bytt bare når fingeren står i
 * midtre 30 % av nabokortet og maks hver 140 ms, lagres ved slipp.
 */
@Composable
private fun HomeCards23(vm: AppViewModel, x: SubsX, t: SubTok) {
    val s = vm.m23
    val hid = vm.p37.subHid
    // Prompt 46 (claude-code-provperioder-skjul-tom.md): prøveperiodene skjules uten aktive prøver (vises igjen i redigering og mens man legger til).
    LaunchedEffect(vm.account?.id) { if (vm.p31.trials.isEmpty()) vm.loadTrials31() }
    val order = s.subOrder.filter { it !in hid && (it != "trials" || s.subArrange || vm.subAdding || vm.activeTrials46()) }
    val heights = remember { HashMap<String, Int>() }
    val offset = remember { mutableFloatStateOf(0f) }
    val gapPx = with(androidx.compose.ui.platform.LocalDensity.current) { 14.dp.toPx() }
    val wob = androidx.compose.animation.core.rememberInfiniteTransition(label = "soWig").animateFloat(-.6f, .6f,
        androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(300), androidx.compose.animation.core.RepeatMode.Reverse), label = "w")
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (s.subArrange) {
            Row(Modifier.fillMaxWidth().shadow(14.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .35f), spotColor = Color.Black.copy(alpha = .35f)).clip(CircleShape).background(t.card)
                .padding(start = 8.dp, top = 8.dp, end = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(t.chip).clickable { Haptics.select(); vm.p37.subAdd = true }.padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("＋", modifier = Modifier.semantics { contentDescription = "Legg til" }, color = t.fg, fontFamily = sans, fontWeight = FontWeight.Bold, style = HomelabType.callout)
                    if (hid.isNotEmpty()) Text("${hid.size}", color = t.neg, fontFamily = sans, fontWeight = FontWeight.Bold, style = HomelabType.subheadline)
                }
                Text("Dra for å flytte · − for å skjule", color = t.fg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.footnote, modifier = Modifier.weight(1f), maxLines = 2)
                Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(t.chip).clickable { Haptics.select(); vm.saveSubOrder23(SUB_HOME_DEFAULT); vm.setSubHid37(emptyList()) }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                    Text("Tilbakestill", color = t.fg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.footnote)
                }
                Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(t.fg).clickable { s.subArrange = false; s.subDrag = null; vm.p37.subAdd = false; Haptics.success() }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                    Text("Ferdig", color = t.card, fontFamily = sans, fontWeight = FontWeight.Bold, style = HomelabType.subheadline)
                }
            }
        }
        order.forEachIndexed { idx, key ->
            val drag = s.subDrag == key
            val r = if (key == "ai") 28.dp else 24.dp
            Box(
                Modifier.zIndex(if (drag) 1f else 0f)
                    .graphicsLayer {
                        translationY = if (drag) offset.floatValue else 0f; val k = if (drag) 1.03f else 1f; scaleX = k; scaleY = k; alpha = if (drag) .85f else 1f
                        rotationZ = if (s.subArrange && !drag) wob.value * (if (idx % 2 == 0) 1f else -1f) else 0f
                    }
                    .drawBehind {
                        if (s.subArrange) {
                            val o = 3.dp.toPx()
                            val w = (if (drag) 2.dp else 1.5.dp).toPx()
                            drawRoundRect(if (drag) t.fg else t.bd, topLeft = Offset(-o, -o), size = Size(size.width + 2 * o, size.height + 2 * o), cornerRadius = CornerRadius(r.toPx() + o),
                                style = Stroke(w, pathEffect = if (drag) null else PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx()))))
                        }
                    }
                    .onGloballyPositioned { heights[key] = it.size.height }
                    .pointerInput(key) {
                        awaitEachGesture {
                            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                            if (!s.subArrange) {
                                // Hold inne 0,45 s uten å flytte fingeren: start redigering. Ellers vanlig trykk eller rulling.
                                var early = false
                                val timedOut = withTimeoutOrNull(450L) {
                                    while (!early) {
                                        val e = awaitPointerEvent(PointerEventPass.Initial)
                                        val c = e.changes.firstOrNull { it.id == down.id }
                                        if (c == null || !c.pressed || (c.position - down.position).getDistance() > viewConfiguration.touchSlop) early = true
                                    }
                                    true
                                } == null
                                if (!timedOut) return@awaitEachGesture
                                Haptics.tap()
                                s.subArrange = true
                            } else down.consume()
                            s.subDrag = key
                            offset.floatValue = 0f
                            var lastSw = 0L
                            while (true) {
                                val e = awaitPointerEvent(PointerEventPass.Initial)
                                val c = e.changes.firstOrNull { it.id == down.id } ?: break
                                c.consume()
                                if (!c.pressed) break
                                offset.floatValue += c.position.y - c.previousPosition.y
                                val now = android.os.SystemClock.uptimeMillis()
                                if (now - lastSw < 140) continue
                                val l = s.subOrder.filter { it !in vm.p37.subHid }
                                val i = l.indexOf(key)
                                val next = l.getOrNull(i + 1)
                                val prev = l.getOrNull(i - 1)
                                val own = (heights[key] ?: 0).toFloat()
                                // Pekeren i forhold til toppen av eget kort (der kortet lå da draget startet / etter siste bytte).
                                val py = down.position.y + offset.floatValue
                                val hn = (heights[next] ?: 0).toFloat()
                                val hp = (heights[prev] ?: 0).toFloat()
                                val full = s.subOrder.toMutableList()
                                if (next != null && hn > 0 && py in (own + gapPx + hn * .35f)..(own + gapPx + hn * .65f)) {
                                    offset.floatValue -= hn + gapPx
                                    full.remove(key); full.add(full.indexOf(next) + 1, key)
                                    s.subOrder = full
                                    lastSw = now
                                    Haptics.select()
                                } else if (prev != null && hp > 0 && py in (-gapPx - hp * .65f)..(-gapPx - hp * .35f)) {
                                    offset.floatValue += hp + gapPx
                                    full.remove(key); full.add(full.indexOf(prev), key)
                                    s.subOrder = full
                                    lastSw = now
                                    Haptics.select()
                                }
                            }
                            s.subDrag = null
                            offset.floatValue = 0f
                            vm.saveSubOrder23(s.subOrder)
                        }
                    },
            ) {
                when (key) {
                    "trials" -> TrialsOS37(vm, t)
                    "ai" -> AiCard23(vm, x)
                    "next7" -> WeekCard23(x, t)
                    "check" -> CheckCard23(vm, x, t)
                    else -> ListCard23(vm, x, t)
                }
                if (s.subArrange && !drag) {
                    Box(Modifier.matchParentSize().clickable(remember { androidx.compose.foundation.interaction.MutableInteractionSource() }, null) {})
                    MinusDot28(SUB_NAMES37[key] ?: key, Modifier.align(Alignment.TopStart)) { Haptics.select(); vm.setSubHid37(vm.p37.subHid + key) }
                }
            }
        }
    }
    if (vm.p37.subAdd) SubAddCards37(vm, t)
}

/** «Legg til kort»: skjulte kort med grønn ＋. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SubAddCards37(vm: AppViewModel, t: SubTok) {
    val hid = vm.p37.subHid
    val close = { vm.p37.subAdd = false }
    ModalBottomSheet(onDismissRequest = close, containerColor = t.sheet, contentColor = t.fg) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 18.dp, end = 18.dp, bottom = 26.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Legg til kort", color = t.fg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.headline, modifier = Modifier.weight(1f))
                SheetButton30("Ferdig", dark = t.card.luminance() < .5f, onClick = close)
            }
            if (hid.isEmpty()) Text("Alle kortene vises. Trykk − på et kort for å skjule det.", color = t.mut, fontFamily = sans, style = HomelabType.subheadline)
            else Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(t.card)) {
                hid.forEachIndexed { i, k ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(t.bd))
                    Row(Modifier.fillMaxWidth().heightIn(min = 54.dp).clickable { Haptics.select(); vm.setSubHid37(hid - k); if (hid.size <= 1) close() }.padding(horizontal = 16.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Text(SUB_NAMES37[k] ?: k, color = t.fg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.callout, modifier = Modifier.weight(1f))
                        Box(Modifier.size(28.dp).clip(CircleShape).background(t.ok), contentAlignment = Alignment.Center) { Text("＋", color = HomelabTheme.colors.onSuccess, fontWeight = FontWeight.Bold, style = HomelabType.callout) }
                    }
                }
            }
        }
    }
}

/* ---------------- Prompt 37: GRATIS PRØVEPERIODER ---------------- */

private val WD37S = listOf("man", "tir", "ons", "tor", "fre", "lør", "søn")
private fun day37(d: LocalDate) = "${WD37S[d.dayOfWeek.value - 1]} ${d.dayOfMonth}. ${MON_L[d.monthValue - 1].take(3)}"

/**
 * Øverst på Oversikt: én rad per aktiv prøve (færrest dager igjen først) med logo, «Slutter fre 24. okt · deretter 149 kr/mnd», stort tall
 * (rødt ≤ 2, gult ≤ 7), fremdriftslinje, Avslutt nå ↗, Behold · legg til og «Varsel tor 23. okt». Tom: «Ingen aktive prøveperioder …».
 */
@Composable
private fun TrialsOS37(vm: AppViewModel, t: SubTok) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val today = LocalDate.now()
    val l = vm.p31.trials.filter { it.status == "active" && !it.endsAt.isBefore(today) }.sortedBy { it.endsAt }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(t.card).padding(16.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("GRATIS PRØVEPERIODER" + if (l.isNotEmpty()) " · ${l.size}" else "", color = t.acc, fontFamily = mono, fontWeight = FontWeight.SemiBold, style = HomelabType.caption, letterSpacing = 1.2.sp, modifier = Modifier.weight(1f))
            Text("+ Legg til", color = t.fg, fontFamily = sans, fontWeight = FontWeight.Bold, style = HomelabType.subheadline,
                modifier = Modifier.clip(CircleShape).clickable { if (!vm.m23.subArrange) { Haptics.select(); vm.resetTrialForm31(); vm.b28.addStep = "trial"; vm.subAdding = true } }.padding(8.dp, 4.dp))
        }
        if (l.isEmpty()) Text("Ingen aktive prøveperioder. Legg til en, så minner Glimt deg på å avslutte i tide.", color = t.mut, fontFamily = sans, style = HomelabType.subheadline)
        l.forEach { tr ->
            val left = ChronoUnit.DAYS.between(today, tr.endsAt)
            val col = when { left <= 2 -> t.neg; left <= 7 -> t.warn; else -> t.fg }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    RoundLogo23(vm, null, tr.service, 40)
                    Column(Modifier.weight(1f)) {
                        Text(tr.service, color = t.fg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.callout, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("Slutter ${day37(tr.endsAt)}" + (tr.priceAfter.takeIf { it.isNotBlank() }?.let { " · deretter $it" } ?: ""), color = t.mut, fontFamily = sans, style = HomelabType.footnote, maxLines = 2)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("$left", color = col, fontFamily = mono, fontWeight = FontWeight.SemiBold, style = HomelabType.title2, lineHeight = 28.sp)
                        Text(if (left == 1L) "dag igjen" else "dager igjen", color = t.mut, fontFamily = sans, style = HomelabType.caption, fontWeight = FontWeight.Normal)
                    }
                }
                Box(Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(3.dp)).background(t.chip)) {
                    Box(Modifier.fillMaxWidth((1f - left / maxOf(30f, left.toFloat())).coerceIn(.04f, 1f)).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(col))
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.height(32.dp).clip(CircleShape).background(t.fg).clickable {
                        Haptics.select(); tr.cancelUrl?.let { openLink(ctx, it) }; vm.patchTrial31(tr.id, "cancelled")
                    }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) { Text("Avslutt nå ↗", color = t.card, fontFamily = sans, fontWeight = FontWeight.Bold, style = HomelabType.footnote) }
                    Box(Modifier.height(32.dp).clip(CircleShape).border(1.dp, t.bd, CircleShape).clickable {
                        Haptics.select()
                        vm.patchTrial31(tr.id, "kept")
                        val price = Regex("(\\d+[\\d ]*[,.]?\\d*)").find(tr.priceAfter)?.value?.replace(" ", "")?.replace(',', '.')?.toDoubleOrNull() ?: 0.0
                        vm.b27.subPrefill = SubShot27(tr.service, "", price, "NOK", null, "monthly", tr.endsAt.toString(), "Annet", null, null, emptySet(), null)
                        vm.m23.subEditNew = true
                    }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) { Text("Behold · legg til", color = t.fg, fontFamily = sans, fontWeight = FontWeight.Bold, style = HomelabType.footnote) }
                    Spacer(Modifier.weight(1f))
                    Text("Varsel ${day37(tr.endsAt.minusDays(1))}", color = t.mut, fontFamily = sans, style = HomelabType.caption, fontWeight = FontWeight.Normal, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun AiCard23(vm: AppViewModel, x: SubsX) {
    // Kortet er mørkt i alle temaer (designet): Glass-tokenene gir mørk flate, lys tekst og den oransje gløden.
    val g = DsPalette.GlassMork
    val flagged = x.items.filter { it.flagged }
    val up = flagged.count { it.status == "price_up" }
    val save = x.saveMonthly.takeIf { it > 0 } ?: flagged.sumOf { it.monthly }
    val txt = when {
        flagged.isEmpty() -> x.suggestions.firstOrNull()?.text ?: "Alle abonnementene ser ut til å være i bruk."
        up == 0 -> "AI fant ${flagged.size} abonnement${if (flagged.size == 1) "" else "er"} å se på."
        else -> "AI fant ${flagged.size} abonnement${if (flagged.size == 1) "" else "er"} å se på, og ${if (up == 1) "én prisøkning" else "$up prisøkninger"}."
    }
    Column(
        Modifier.fillMaxWidth().heightIn(min = 250.dp).clip(RoundedCornerShape(28.dp))
            .drawBehind {
                drawRect(Brush.radialGradient(0f to g.accent.copy(alpha = .42f).compositeOver(g.surface), .5f to g.accent.copy(alpha = .14f).compositeOver(g.surface), .85f to g.surfaceRaised.compositeOver(g.surface), 1f to g.surfaceRaised.compositeOver(g.surface),
                    center = Offset(size.width, 0f), radius = maxOf(size.width * 1.2f, 1f)))
            }.padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = .1f)).padding(11.dp, 5.dp)) {
            Text("✦ AI-SPARING", color = g.accent, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.footnote)
        }
        Text("Spar ${kr23(save)}\ni måneden", color = g.textPrimary, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.title2, lineHeight = 36.7.sp, letterSpacing = (-0.68).sp)
        Text(txt, color = g.textPrimary.copy(alpha = .8f), fontFamily = sans, style = HomelabType.callout, lineHeight = 20.3.sp)
        Spacer(Modifier.weight(1f, fill = false))
        Box(Modifier.height(44.dp).clip(RoundedCornerShape(22.dp)).background(g.textPrimary).clickable(onClickLabel = "Gå gjennom abonnementene") { Haptics.select(); vm.subTab = "hist" }.padding(horizontal = 20.dp), contentAlignment = Alignment.Center) {
            Text("Gå gjennom", color = g.surface, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.callout)
        }
    }
}

@Composable
private fun WeekCard23(x: SubsX, t: SubTok) {
    val today = LocalDate.now()
    val days = (1..7).map { today.plusDays(it.toLong()).toString() }
    val list = x.upcoming.filter { it.date.take(10) in days }
    val per = days.map { d -> list.filter { it.date.startsWith(d) }.sumOf { it.amount } }
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(t.card).padding(18.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f)) {
            Text("Neste 7 dager", color = t.mut, fontFamily = sans, style = HomelabType.callout)
            Text(kr23(list.sumOf { it.amount }), color = t.fg, fontFamily = mono, fontWeight = FontWeight.SemiBold, style = HomelabType.title2, maxLines = 1, modifier = Modifier.padding(top = 6.dp))
            Text("${list.size} trekk", color = t.mut, fontFamily = sans, style = HomelabType.subheadline)
        }
        Row(Modifier.height(56.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            (0 until 14).forEach { i ->
                val v = per[i / 2]
                Box(Modifier.width(7.dp).height((v / 16).coerceIn(4.0, 56.0).dp).clip(RoundedCornerShape(3.dp)).background(if (v > 0) t.acc else t.off))
            }
        }
    }
}

@Composable
private fun CheckCard23(vm: AppViewModel, x: SubsX, t: SubTok) {
    val flagged = x.items.filter { it.flagged }
    val save = x.saveMonthly.takeIf { it > 0 } ?: flagged.sumOf { it.monthly }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(t.card).clickable { Haptics.select(); vm.subTab = "hist" }.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(42.dp).clip(CircleShape).background(t.acc.copy(alpha = .14f)), contentAlignment = Alignment.Center) { Text("♛", color = t.acc, style = HomelabType.headline, fontWeight = FontWeight.Normal) }
            Column {
                Text("Abonnementssjekk", color = t.fg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.body)
                Text("Gå gjennom før fornyelse", color = t.mut, fontFamily = sans, style = HomelabType.subheadline)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(buildAnnotatedString {
                withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append("${flagged.size} abonnement${if (flagged.size == 1) "" else "er"}") }
                append(" trenger en titt · spar opptil ")
                withStyle(SpanStyle(color = t.acc)) { append(kr23(save)) }
            }, color = t.fg, fontFamily = sans, style = HomelabType.callout, lineHeight = 19.6.sp, modifier = Modifier.weight(1f))
            Row {
                flagged.take(3).forEachIndexed { i, s ->
                    Box(Modifier.offset(x = (-8 * i).dp)) { RoundLogo23(vm, s, s.name, 30, ring = t.card) }
                }
            }
        }
    }
}

@Composable
private fun ListCard23(vm: AppViewModel, x: SubsX, t: SubTok) {
    val list = x.items.filter { it.active }.sortedBy { it.nextDate.ifBlank { "9999" } }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(t.card).padding(horizontal = 16.dp, vertical = 6.dp)) {
        if (list.isEmpty()) Text("Ingen abonnementer ennå. Trykk + for å legge til.", color = t.mut, fontFamily = sans, style = HomelabType.subheadline, modifier = Modifier.padding(vertical = 12.dp))
        list.forEachIndexed { i, s ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(t.bd))
            Row(Modifier.fillMaxWidth().clickable { if (!vm.m23.subArrange) { Haptics.select(); vm.m23.subEditId = s.id } }.padding(vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                RoundLogo23(vm, s, s.name, 34)
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(s.name, color = t.fg, fontFamily = sans, fontWeight = FontWeight.Medium, style = HomelabType.callout, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                        // Prompt 37: delte abonnementer viser medlemmene som små avatarer.
                        if (s.shared) Avatars37(s.members.map { it.name to it.color }, ring = t.card)
                    }
                    Text(listOfNotNull(s.plan.takeIf { it.isNotBlank() && it != "–" }, s.nextDate.takeIf { it.isNotBlank() }?.let { whenText23(it) }).joinToString(" · ").ifBlank { s.cycleName },
                        color = t.mut, fontFamily = sans, style = HomelabType.footnote, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (s.shared) Text(s.shareLabel ?: "Delt · din del ${kr23(vm.myShare37(s))}/mnd", color = t.ok, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.footnote, maxLines = 1)
                }
                Text(kr23(s.price), color = t.fg, fontFamily = mono, fontWeight = FontWeight.Bold, style = HomelabType.callout)
            }
        }
    }
}

/* ---------------- Innsikt ---------------- */

/** Stripete fyll (135°, 6 px farge og 3 px mørkere), som repeating-linear-gradient i designet. */
private fun androidx.compose.ui.graphics.drawscope.DrawScope.stripes(c: Color, c2: Color, r: Float) {
    drawRoundRect(c2, cornerRadius = CornerRadius(r))
    clipRect {
        val step = 9.dp.toPx() * 1.414f
        val w = 6.dp.toPx() * 1.414f
        var x0 = -size.height
        while (x0 < size.width + size.height) {
            drawLine(c, Offset(x0, 0f), Offset(x0 + size.height, size.height), strokeWidth = w / 1.414f * 1.0f, cap = StrokeCap.Butt)
            x0 += step
        }
    }
}

@Composable
private fun MonthCard23(x: SubsX, t: SubTok) {
    val cur = LocalDate.now().monthValue - 1
    val months = if (x.byMonth.size == 12) x.byMonth.subList((cur - 5).coerceAtLeast(0), cur + 1) else x.byMonth.takeLast(6)
    var sel by remember(months.size) { mutableStateOf(months.size - 1) }
    val mx = (months.maxOfOrNull { it.total } ?: 0.0).coerceAtLeast(1.0)
    val prev = x.prevMonthly
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(t.card).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Abonnementer per måned", color = t.mut, fontFamily = sans, style = HomelabType.callout)
        Text(kr23(x.monthly), color = t.fg, fontFamily = mono, fontWeight = FontWeight.SemiBold, style = HomelabType.title2, maxLines = 1)
        if (prev != null && prev > 0 && kotlin.math.abs(x.monthly - prev) >= 1) {
            val pct = (x.monthly - prev) / prev * 100
            Text("${if (pct >= 0) "▲" else "▼"} ${String.format(java.util.Locale.forLanguageTag("nb-NO"), "%.1f", kotlin.math.abs(pct))} % fra forrige måned", color = t.neg, fontFamily = sans, style = HomelabType.subheadline)
        }
        if (months.isNotEmpty()) Row(Modifier.fillMaxWidth().height(130.dp).padding(top = 6.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            months.forEachIndexed { i, m ->
                val on = i == sel
                Column(Modifier.weight(1f).fillMaxHeight().clickable { Haptics.select(); sel = i }, verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.Bottom)) {
                    Box(Modifier.fillMaxWidth().fillMaxHeight((m.total / mx * 0.78).toFloat().coerceIn(0.03f, 0.78f) / 0.86f).clip(RoundedCornerShape(10.dp)).drawBehind {
                        if (on) stripes(t.acc, t.accDeep, 10.dp.toPx()) else drawRoundRect(t.off, cornerRadius = CornerRadius(10.dp.toPx()))
                    })
                    val mi = m.month.takeLast(2).toIntOrNull() ?: 0
                    Text(if (mi in 1..12) MON_S[mi - 1] else m.month, color = if (on) t.fg else t.grey, fontFamily = sans, style = HomelabType.footnote, maxLines = 1,
                        modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                }
            }
        }
    }
}

@Composable
private fun HealthCard23(x: SubsX, score: Double, t: SubTok) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(t.card).padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Abonnementshelse", color = t.fg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.body, modifier = Modifier.weight(1f))
            if (x.healthLabel.isNotBlank()) Box(Modifier.clip(RoundedCornerShape(10.dp)).background(t.okSoft).padding(10.dp, 3.dp)) {
                Text(x.healthLabel, color = t.ok, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.footnote)
            }
        }
        Box(Modifier.size(230.dp, 130.dp), contentAlignment = Alignment.BottomCenter) {
            Canvas(Modifier.fillMaxSize()) {
                val k = size.width / 220f
                for (i in 0 until 30) {
                    val a = Math.PI * (1 - i / 29.0)
                    val on = i / 29.0 <= score / 100
                    val c = if (on) (if (i < 10) t.accDeep else if (i < 20) t.acc else t.acc.copy(alpha = .6f)) else t.off
                    val cx = 110f * k; val cy = 112f * k; val r1 = 78f * k; val r2 = 100f * k
                    drawLine(c, Offset(cx + r1 * kotlin.math.cos(a).toFloat(), cy - r1 * kotlin.math.sin(a).toFloat()), Offset(cx + r2 * kotlin.math.cos(a).toFloat(), cy - r2 * kotlin.math.sin(a).toFloat()), 5f * k, StrokeCap.Round)
                }
            }
            Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.padding(bottom = 6.dp)) {
                Text("${Math.round(score)}", color = t.fg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.largeTitle, letterSpacing = (-1.26).sp)
                Text("/100", color = t.grey, fontFamily = sans, style = HomelabType.callout, modifier = Modifier.padding(bottom = 8.dp))
            }
        }
        if (x.healthText.isNotBlank()) Text(x.healthText, color = t.mut, fontFamily = sans, style = HomelabType.subheadline, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

@Composable
private fun CatCard23(x: SubsX, t: SubTok) {
    val per = x.items.filter { it.active }.groupBy { it.category }.mapValues { (_, v) -> v.sumOf { it.monthly } }
    val order = x.categories.ifEmpty { per.keys.toList() }
    val list = per.entries.sortedWith(compareBy({ order.indexOf(it.key).let { i -> if (i < 0) 99 else i } }, { -it.value }))
    val mx = (list.maxOfOrNull { it.value } ?: 0.0).coerceAtLeast(1.0)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(t.card).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Per kategori", color = t.fg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.body)
        if (list.isEmpty()) Text("Ingen aktive abonnementer.", color = t.mut, fontFamily = sans, style = HomelabType.subheadline)
        list.forEachIndexed { i, (k, v) ->
            val (c, c2) = t.cats[i % t.cats.size]
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row {
                    Text(k, color = t.fg, fontFamily = sans, style = HomelabType.subheadline, modifier = Modifier.weight(1f), maxLines = 1)
                    Text(kr23(v), color = t.fg, fontFamily = mono, style = HomelabType.subheadline)
                }
                Box(Modifier.fillMaxWidth().height(12.dp).clip(RoundedCornerShape(6.dp)).background(t.bd)) {
                    Box(Modifier.fillMaxHeight().fillMaxWidth((v / mx).toFloat().coerceIn(0.02f, 1f)).clip(RoundedCornerShape(6.dp)).drawBehind { stripes(c, c2, 6.dp.toPx()) })
                }
            }
        }
    }
}

/* ---------------- Historikk: Smart sparing ---------------- */

@Composable
private fun AgentCard23(vm: AppViewModel, x: SubsX, t: SubTok) {
    val doneKey = "subs_done" + (vm.account?.id ?: "")
    var done by remember(doneKey) { mutableStateOf(vm.prefs.str(doneKey, "").split('\n').filter { it.isNotBlank() }.toSet()) }
    val tasks = x.suggestions
    val nd = tasks.count { it.id in done }
    val all = tasks.isNotEmpty() && nd == tasks.size
    val health = ((x.score ?: 72.0) + nd * 6).coerceAtMost(100.0)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(t.card).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(44.dp).clip(CircleShape).background(t.acc), contentAlignment = Alignment.Center) { Text("✦", color = t.onAcc, fontWeight = FontWeight.Bold, style = HomelabType.headline) }
            Column(Modifier.weight(1f)) {
                Text("Smart sparing", color = t.fg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.body)
                Text("AI-agent", color = t.mut, fontFamily = sans, style = HomelabType.subheadline)
            }
            Box(Modifier.clip(RoundedCornerShape(12.dp)).background(t.bd).padding(10.dp, 5.dp)) { Text("⏳ ${tasks.size - nd} igjen", color = t.fg, fontFamily = sans, style = HomelabType.footnote) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            listOf(Triple("Gjennomgått", "$nd av ${tasks.size}", if (tasks.isEmpty()) 1f else nd.toFloat() / tasks.size) to t.info,
                Triple("Sparehelse", "${Math.round(health)} %", (health / 100).toFloat()) to t.acc).forEach { (v, c) ->
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row {
                        Text(v.first, color = t.mut, fontFamily = sans, style = HomelabType.footnote, modifier = Modifier.weight(1f))
                        Text(v.second, color = t.fg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.footnote)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        (0 until 22).forEach { i -> Box(Modifier.weight(1f).height(14.dp).clip(RoundedCornerShape(2.dp)).background(if (i / 22f < v.third) c else t.off)) }
                    }
                }
            }
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(t.card2).padding(horizontal = 12.dp, vertical = 6.dp)) {
            if (tasks.isEmpty()) Text("Ingen forslag. Abonnementene ser ut til å være i bruk.", color = t.mut, fontFamily = sans, style = HomelabType.subheadline, modifier = Modifier.padding(vertical = 10.dp))
            tasks.forEachIndexed { i, s ->
                val on = s.id in done
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(t.off))
                Row(Modifier.fillMaxWidth().clickable {
                    Haptics.select()
                    done = if (on) done - s.id else (done + s.id).also { Haptics.success() }
                    vm.prefs.set(doneKey, done.joinToString("\n"))
                }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    RoundLogo23(vm, x.item(s.subId), s.name, 30)
                    Text(s.text, color = if (on) t.grey else t.fg, fontFamily = sans, style = HomelabType.callout, textDecoration = if (on) TextDecoration.LineThrough else null, modifier = Modifier.weight(1f))
                    Text(if (on) "✓" else "○", color = if (on) t.ok else t.grey, style = HomelabType.callout)
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Status", color = t.mut, fontFamily = sans, style = HomelabType.subheadline, modifier = Modifier.weight(1f))
            Box(Modifier.clip(RoundedCornerShape(10.dp)).background(if (all || tasks.isEmpty()) t.okSoft else t.acc.copy(alpha = .14f)).padding(10.dp, 3.dp)) {
                Text(if (all || tasks.isEmpty()) "Fullført" else "Pågår", color = if (all || tasks.isEmpty()) t.ok else t.acc, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.subheadline)
            }
        }
    }
}

/* ---------------- «Endre abonnement»-arket i Papir ---------------- */

@Composable
private fun SheetField(label: String, value: String, onChange: (String) -> Unit, t: SubTok, modifier: Modifier = Modifier, placeholder: String = "", mono: Boolean = false, number: Boolean = false) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, color = t.mut, fontFamily = sans, style = HomelabType.footnote)
        BasicTextField(
            value, onChange, singleLine = true,
            textStyle = HomelabType.callout.copy(color = t.fg, fontFamily = if (mono) PaperFonts.mono else sans),
            cursorBrush = SolidColor(t.neg),
            keyboardOptions = if (number) KeyboardOptions(keyboardType = KeyboardType.Decimal) else KeyboardOptions.Default,
            modifier = Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp)).background(t.card).border(1.dp, t.bd, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp),
            decorationBox = { inner -> Box(Modifier.fillMaxHeight(), contentAlignment = Alignment.CenterStart) { if (value.isEmpty()) Text(placeholder, color = t.mut, style = HomelabType.callout, fontFamily = sans); inner() } },
        )
    }
}

@Composable
private fun SheetSelect(label: String?, value: String, options: List<String>, t: SubTok, modifier: Modifier = Modifier, enabled: Boolean = true, onPick: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (label != null) Text(label, color = t.mut, fontFamily = sans, style = HomelabType.footnote)
        Box {
            Row(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp)).background(t.card).border(1.dp, t.bd, RoundedCornerShape(12.dp)).clickable(enabled = enabled) { open = true }.padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Text(value, color = if (enabled) t.fg else t.mut, fontFamily = sans, style = HomelabType.callout, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                if (enabled) Text("▾", color = t.mut, style = HomelabType.subheadline)
            }
            DropdownMenu(open, { open = false }, Modifier.background(t.sheet).heightIn(max = 320.dp)) {
                options.forEachIndexed { i, o -> DropdownMenuItem(text = { Text(o, color = t.fg, fontFamily = sans) }, onClick = { open = false; onPick(i) }) }
            }
        }
    }
}

@Composable
private fun SheetChips(label: String, opts: List<Pair<String, String>>, cur: String, t: SubTok, onPick: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, color = t.mut, fontFamily = sans, style = HomelabType.footnote)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            opts.forEach { (k, n) ->
                val on = cur == k
                Box(Modifier.weight(1f).height(38.dp).clip(RoundedCornerShape(19.dp)).background(if (on) t.on else Color.Transparent).border(1.dp, if (on) t.on else t.bd, RoundedCornerShape(19.dp))
                    .clickable { Haptics.select(); onPick(k) }.padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
                    Text(n, color = if (on) t.onFg else t.fg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.subheadline, maxLines = 1)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SubSheet23(vm: AppViewModel, s: SubItem?, close: () -> Unit) {
    val t = subTok()
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = close, sheetState = state, containerColor = t.sheet, contentColor = t.fg,
        dragHandle = { Box(Modifier.padding(top = 10.dp).size(40.dp, 5.dp).clip(RoundedCornerShape(3.dp)).background(t.bd)) }) {
        SubForm23(vm, s, t, close)
    }
}

@Composable
private fun SubForm23(vm: AppViewModel, s: SubItem?, t: SubTok, close: () -> Unit) {
    // Prompt 27: «Rediger først» fra skjermbildet fyller ut skjemaet (også ved oppdatering av et eksisterende abonnement).
    val pre = remember(s?.id) { vm.b27.subPrefill }
    LaunchedEffect(Unit) { vm.b27.subPrefill = null }
    val preDay = pre?.let { prefillDay27(it) }
    var name by remember(s?.id) { mutableStateOf(s?.name ?: pre?.service ?: "") }
    var price by remember(s?.id) { mutableStateOf((pre?.price ?: s?.price)?.let { if (it % 1.0 == 0.0) it.toLong().toString() else String.format(java.util.Locale.US, "%.2f", it).replace('.', ',') } ?: "") }
    var plan by remember(s?.id) { mutableStateOf(pre?.plan?.takeIf { it.isNotBlank() } ?: s?.plan?.takeIf { it != "–" } ?: "") }
    var category by remember(s?.id) { mutableStateOf(s?.category ?: pre?.category ?: "Annet") }
    var cycle by remember(s?.id) { mutableStateOf(pre?.cycle ?: s?.cycle ?: "monthly") }
    var day by remember(s?.id) { mutableStateOf(preDay?.first ?: (s?.billDay ?: s?.chargeDay) ?: LocalDate.now().dayOfMonth) }
    var month by remember(s?.id) { mutableStateOf(preDay?.second ?: s?.billMonth ?: s?.nextDate?.takeIf { it.length >= 7 }?.substring(5, 7)?.toIntOrNull() ?: LocalDate.now().plusMonths(1).monthValue) }
    var status by remember(s?.id) { mutableStateOf(if (s != null && !s.active) "cancelled" else "active") }
    var pending by remember { mutableStateOf<android.net.Uri?>(null) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> if (uri != null) { if (s != null) vm.subLogoUpload(s.id, uri) else pending = uri } }
    val cats = (vm.subsX?.categories ?: emptyList()).ifEmpty { listOf("Underholdning", "Produktivitet", "Lagring og sky", "Helse og trening", "Transport", "Annet") }
        .let { if (category in it) it else it + category }
    val p = parseAmount(price)
    val valid = name.isNotBlank() && p != null && p >= 0
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().imePadding().padding(20.dp, 8.dp, 20.dp, 26.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(if (s == null) "Nytt abonnement" else "Rediger ${s.name}", color = t.fg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.headline, letterSpacing = (-0.2).sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            SheetButton30("Lukk", "secondary", dark = t.card.luminance() < .5f, onClick = close) // Prompt 30: felles pille
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(t.card).padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.size(64.dp).clip(RoundedCornerShape(18.dp))) { SubLogo(vm, s, name.ifBlank { "?" }, 64) }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Logo", color = t.mut, fontFamily = sans, style = HomelabType.subheadline)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(t.card).border(1.dp, t.bd, RoundedCornerShape(17.dp))
                        .clickable { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                        Text(if (pending != null) "Logo valgt ✓" else "↑ Last opp", color = t.fg, fontFamily = sans, style = HomelabType.subheadline, maxLines = 1)
                    }
                    Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(t.card).border(1.dp, t.bd, RoundedCornerShape(17.dp))
                        .clickable { if (s != null) vm.subLogoAi(s.id) else vm.flash("Lagre abonnementet først, så finner AI logoen") }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                        Text("✦ Finn logo med AI", color = t.neg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.subheadline, maxLines = 1)
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SheetField("Navn", name, { name = it }, t, Modifier.weight(2f), "F.eks. HBO Max")
            SheetField("Pris (kr)", price, { price = it }, t, Modifier.weight(1f), "149", mono = true, number = true)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SheetField("Plan", plan, { plan = it }, t, Modifier.weight(1f), "Standard")
            SheetSelect("Kategori", category, cats, t, Modifier.weight(1f)) { category = cats[it] }
        }
        SheetChips("Hvor ofte", listOf("monthly" to "Månedlig", "yearly" to "Årlig", "biennial" to "Hvert 2. år"), cycle, t) { cycle = it }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Faktureringsdato", color = t.mut, fontFamily = sans, style = HomelabType.footnote)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SheetSelect(null, "$day.", (1..31).map { "$it." }, t, Modifier.width(96.dp)) { day = it + 1 }
                SheetSelect(null, if (cycle == "monthly") "hver måned" else MON_NL[(month - 1).coerceIn(0, 11)], MON_NL, t, Modifier.weight(1f), enabled = cycle != "monthly") { month = it + 1 }
            }
            // Fase 5: teksten kommer fra serveren (samme regel som når abonnementet lagres); den lokale er bare reserve uten nett.
            val billMonth: Int? = if (cycle == "monthly") null else month
            val nesteTrekk: String by produceState(nextChargeText(day, billMonth, cycle), day, billMonth, cycle) {
                value = nextChargeText(day, billMonth, cycle) // straks (og uten nett), til serveren svarer
                kotlinx.coroutines.delay(250)
                vm.nextChargeLabel(day, billMonth, cycle)?.let { value = it }
            }
            Text(nesteTrekk, color = t.neg, fontFamily = sans, style = HomelabType.footnote)
        }
        SheetChips("Status", listOf("active" to "Aktiv", "cancelled" to "Sagt opp"), status, t) { status = it }
        // Prompt 37: Del med husstanden (Starlink): medlemmer, Del likt / Jeg betaler, din del.
        if (s != null) SubShare37(vm, s, t)
        Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f).height(48.dp).alpha(if (valid) 1f else .4f).clip(RoundedCornerShape(24.dp)).background(t.on).clickable(enabled = valid) {
                Haptics.tap()
                vm.saveSub(s?.id, name, plan, p ?: 0.0, cycle, day.coerceIn(1, 31), if (cycle == "monthly") null else month, category, status, pending)
                close()
            }, contentAlignment = Alignment.Center) { Text("Lagre", color = t.onFg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.body) }
            if (s != null) Box(Modifier.height(48.dp).clip(RoundedCornerShape(24.dp)).border(1.dp, t.bd, RoundedCornerShape(24.dp)).clickable { Haptics.tap(); vm.deleteSub(s.id); close() }
                .padding(horizontal = 18.dp), contentAlignment = Alignment.Center) { Text("Slett", color = t.neg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.callout) }
        }
        if (!valid) Text(if (name.isBlank()) "Skriv inn navnet på tjenesten." else "Skriv inn prisen i kroner, f.eks. 149.", color = t.mut, fontFamily = sans, style = HomelabType.footnote)
    }
}

/* ---------------- Prompt 37: Del med husstanden ---------------- */

/**
 * Redigeringsarket → DEL MED HUSSTANDEN: brukerne som chips med avatar (du selv er alltid med), Del likt / Jeg betaler og hintet
 * «Hver betaler 400 kr/mnd …». Lagres med PUT /finans/api/subscriptions/:id/members. Medlemmer som ikke eier/betaler kan forlate.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SubShare37(vm: AppViewModel, s: SubItem, t: SubTok) {
    val me = vm.p37.myId
    val users = vm.p37.users
    var picked by remember(s.id, s.members) { mutableStateOf(s.members.map { it.userId }.toSet()) }
    var split by remember(s.id, s.split) { mutableStateOf(s.split ?: "equal") }
    val canEdit = s.canEdit ?: (s.ownerId == null || s.ownerId == me || s.payerId == me || !s.shared)
    val all = (picked + listOfNotNull(me)).toList()
    val n = all.size.coerceAtLeast(1)
    val changed = picked != s.members.map { it.userId }.toSet() || split != (s.split ?: "equal")
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Del med husstanden", color = t.mut, fontFamily = sans, style = HomelabType.footnote)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            users.forEach { u ->
                val self = u.id == me
                val on = self || u.id in picked
                Row(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(if (on) t.on else t.card).border(1.dp, if (on) t.on else t.bd, RoundedCornerShape(18.dp))
                    .clickable(enabled = canEdit && !self) { Haptics.select(); picked = if (on) picked - u.id else picked + u.id }.padding(start = 4.dp, end = 12.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Avatars37(listOf(u.name to u.color), size = 28.dp, ring = if (on) t.on else t.card)
                    Text(firstName37(u.name).ifBlank { "Uten navn" } + if (self) " (deg)" else "", color = if (on) t.onFg else t.fg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.subheadline)
                }
            }
            if (users.isEmpty()) Text("Henter husstanden …", color = t.mut, fontFamily = sans, style = HomelabType.subheadline)
        }
        if (all.size > 1) {
            SheetChips("Deling", listOf("equal" to "Del likt", "payer" to "Jeg betaler"), split, t) { if (canEdit) split = it }
            Text(if (split == "equal") "Hver betaler ${kr23(s.monthly / n)}/mnd. Alle ser abonnementet, trekkdato og varsler. Bare din del teller i ditt budsjett."
                else "Du betaler hele beløpet (${kr23(s.monthly)}/mnd). De andre ser abonnementet, men det teller 0 i deres budsjett.",
                color = t.mut, fontFamily = sans, style = HomelabType.footnote)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (canEdit && changed) Box(Modifier.height(40.dp).clip(RoundedCornerShape(20.dp)).background(t.on).clickable(enabled = !vm.p37.subShareBusy) {
                Haptics.tap(); vm.shareSub37(s.id, all, split, if (split == "payer") me else s.payerId)
            }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) { Text(if (vm.p37.subShareBusy) "Lagrer …" else "Lagre deling", color = t.onFg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.callout) }
            if (s.shared && !canEdit) Box(Modifier.height(40.dp).clip(RoundedCornerShape(20.dp)).border(1.dp, t.bd, RoundedCornerShape(20.dp)).clickable { Haptics.tap(); vm.leaveSub37(s.id) }
                .padding(horizontal = 16.dp), contentAlignment = Alignment.Center) { Text("Forlat abonnementet", color = t.neg, fontFamily = sans, fontWeight = FontWeight.SemiBold, style = HomelabType.callout) }
        }
    }
}

private val MON27 = listOf("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")

/** «✦ Ollama leser skjermbildet»: miniatyr, rader med ✓ / «Sjekk», «+ Legg til …» og «Rediger først». */
@Composable
internal fun SubShotCard27(vm: AppViewModel, card: Color, fg: Color, mut: Color, line: Color, check: Color, ok: Color) {
    val s = vm.b27
    if (!s.shotOpen) return
    val r = s.shot
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(card).border(1.dp, HomelabTheme.colors.accent.copy(alpha = .33f), RoundedCornerShape(24.dp)).padding(18.dp, 18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("✦ Ollama leser skjermbildet", color = fg, fontWeight = FontWeight.SemiBold, style = HomelabType.body, fontFamily = PaperFonts.sans, modifier = Modifier.weight(1f))
            SheetButton30("Lukk", "secondary", dark = card.luminance() < .5f) { s.shotOpen = false; s.shot = null; s.shotThumb = null } // Prompt 30
        }
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.Top) {
            Box(Modifier.size(76.dp, 130.dp).clip(RoundedCornerShape(12.dp)).background(line).border(1.dp, line, RoundedCornerShape(12.dp))) {
                s.shotThumb?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, alignment = Alignment.TopCenter, modifier = Modifier.fillMaxSize()) }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                when {
                    s.shotBusy -> {
                        Text("Finner tjeneste, plan, pris og trekkdato …", color = fg, style = HomelabType.callout, lineHeight = 20.sp)
                        Spacer(Modifier.height(8.dp))
                        androidx.compose.material3.LinearProgressIndicator(color = HomelabTheme.colors.accent, trackColor = line, modifier = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)))
                        Spacer(Modifier.height(6.dp))
                        Text(s.shotName, color = mut, style = HomelabType.footnote, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    s.shotError != null -> Text(s.shotError ?: "", color = check, style = HomelabType.subheadline, lineHeight = 19.sp)
                    r != null -> {
                        val (day, mon) = shotDay27(r)
                        val price = (if (r.currency.uppercase() != "NOK") "≈ " else "") + krShot(r.price).removePrefix("−") + (r.priceOriginal?.let { " ($it)" } ?: "")
                        listOf(
                            Triple("Tjeneste", r.service, "tjeneste"), Triple("Plan", r.plan.ifBlank { "–" }, "plan"), Triple("Pris", price, "pris"),
                            Triple("Syklus", if (r.cycle == "yearly") "Årlig" else "Månedlig", "syklus"), Triple("Neste trekk", "$day. ${MON27[(mon - 1).coerceIn(0, 11)]}", "neste_trekk"),
                            Triple("Kategori", r.category, "kategori"),
                        ).forEach { (k, v, key) ->
                            val unsure = key in r.check || (key == "pris" && r.currency.uppercase() != "NOK" && "valuta" in r.check)
                            Column {
                                Row(Modifier.fillMaxWidth().heightIn(min = 34.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text(k, color = mut, style = HomelabType.footnote, modifier = Modifier.width(92.dp))
                                    Text(v, color = fg, fontWeight = FontWeight.SemiBold, style = HomelabType.callout, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                    Text(if (unsure) "Sjekk" else "✓", color = if (unsure) check else ok, fontWeight = FontWeight.Bold, style = HomelabType.caption)
                                }
                                Box(Modifier.fillMaxWidth().height(1.dp).background(line))
                            }
                        }
                    }
                }
            }
        }
        if (r != null && !s.shotBusy) {
            if (r.existingId != null) Text("${r.service} finnes allerede. Du kan oppdatere plan og pris.", color = check, style = HomelabType.footnote)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).background(HomelabTheme.colors.accent).clickable { Haptics.tap(); vm.addShot27(r) }, contentAlignment = Alignment.Center) {
                    Text(if (r.existingId != null) "Oppdater ${r.service}" else "+ Legg til ${r.service}", color = HomelabTheme.colors.onAccent, fontWeight = FontWeight.SemiBold, style = HomelabType.callout, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Box(Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, line, RoundedCornerShape(22.dp)).clickable { vm.editShot27(r) }, contentAlignment = Alignment.Center) {
                    Text("Rediger først", color = fg, fontWeight = FontWeight.SemiBold, style = HomelabType.callout)
                }
            }
        }
        Text("Leses lokalt av qwen2.5vl på hjemmeserveren. Bildet slettes etter lesing. Felt merket «Sjekk» var utydelige.", color = mut, style = HomelabType.footnote, lineHeight = 17.sp)
    }
}

/** Første trekk-dato i skjemaet fra et skjermbilde (dag, måned). */
internal fun prefillDay27(r: SubShot27): Pair<Int, Int> = shotDay27(r)

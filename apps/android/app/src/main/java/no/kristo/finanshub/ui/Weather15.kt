package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.Locale
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.roundToInt

/*
 * Værsiden (prompt 22, fasit design/Vaer.dc.html): systemfont bare her, stor tynn temperatur, animert værbakgrunn,
 * timekort med Pent i oransje, 7 dager, «Yr og Pent», vind, måne og fliser. Alle kort åpner et detaljark med 7-dagersvelger.
 * Bunnlinje (prompt 28): værkart (Windy) til venstre, ☰ Steder til høyre (søk, legg til, hold inne og dra, sveip mot høyre for å slette).
 * Data fra GET /api/weather/full (MET), Pent fra compare i samme svar eller GET /api/weather/compare.
 */

internal val wxNb = Locale("nb", "NO")
private val glassBg = Color.White.copy(alpha = .16f)
internal val wxBlue = Color(0xFFBFE6FF)
internal val wxPp = Color(0xFF9FE0FF)

/* ---------- Ikoner (samme stier som i designet, 24×24) ---------- */

internal val WX_IC: Map<String, String> = mapOf(
    "sun" to "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
    "moon" to "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
    "part" to "M8 4v1.5M3.5 9H5M4.8 5.8l1 1M11.2 5.8l-1 1M8 7a3 3 0 0 0-2.8 4M7 19h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.4 1.5A3.3 3.3 0 0 0 7 19z",
    "cloud" to "M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z",
    "rain" to "M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3",
    "snow" to "M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 14zM8 18h.01M12 20h.01M16 18h.01",
    "fog" to "M4 10h16M6 14h12M4 18h16",
    "storm" to "M7 13h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 13zM12 14l-2 4h3l-2 4",
)
internal val WX_ICC: Map<String, Long> = mapOf(
    "sun" to 0xFFFFD36B, "moon" to 0xFFF2F2F2, "part" to 0xFFFFE7A8, "cloud" to 0xFFFFFFFF, "rain" to 0xFFBFE6FF, "snow" to 0xFFFFFFFF, "fog" to 0xFFE6ECF3, "storm" to 0xFFFFD36B,
)
private const val P_DROP = "M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z"
private const val P_WIND = "M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"

/** Ikonnøkkel for WMO-kode og natt, som ICN i designet. */
internal fun wxKey(c: Int, night: Boolean): String = when {
    c <= 1 -> if (night) "moon" else "sun"
    c <= 2 -> if (night) "moon" else "part"
    c == 3 -> "cloud"
    c <= 48 -> "fog"
    c <= 67 || c in 80..82 -> "rain"
    c <= 86 -> "snow"
    else -> "storm"
}
internal fun wxDesc(c: Int): String = when {
    c == 0 -> "Klart"; c <= 2 -> "Delvis skyet"; c == 3 -> "Overskyet"; c <= 48 -> "Tåke"; c <= 57 -> "Yr"; c <= 67 -> "Regn"
    c <= 77 -> "Snø"; c <= 82 -> "Regnbyger"; c <= 86 -> "Snøbyger"; else -> "Torden"
}

private val pathCache = HashMap<String, Path>()
internal fun wxPath(d: String): Path = pathCache.getOrPut(d) { PathParser().parsePathString(d).toPath() }

/** SVG-ikon (24×24) tegnet som strek, eller fylt. */
@Composable
internal fun WxIcon(d: String, color: Color, size: Dp, stroke: Float = 1.8f, fill: Boolean = false) {
    Canvas(Modifier.size(size)) {
        val k = this.size.minDimension / 24f
        scale(k, k, pivot = Offset.Zero) {
            if (fill) drawPath(wxPath(d), color)
            else drawPath(wxPath(d), color, style = Stroke(stroke, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
internal fun WxCodeIcon(key: String, size: Dp) = WxIcon(WX_IC[key] ?: WX_IC.getValue("cloud"), Color(WX_ICC[key] ?: 0xFFFFFFFF), size)

/* ---------- Formatering ---------- */

internal fun wxR(v: Double?): String = v?.let { "${it.roundToInt()}°" } ?: "–"
/** Én desimal med komma, uten «,0» (som String(Math.round(v*10)/10) i designet). */
internal fun wxF1(v: Double?): String {
    if (v == null) return "–"
    val r = (v * 10).roundToInt() / 10.0
    return if (r == r.toLong().toDouble()) r.toLong().toString() else r.toString().replace('.', ',')
}
internal fun wxHm(s: String?): String = s?.takeIf { it.length >= 16 }?.substring(11, 16) ?: "–"
internal fun wxLdt(t: String?): LocalDateTime? = t?.let { runCatching { LocalDateTime.parse(it.take(16)) }.getOrNull() }
internal fun wxLd(t: String?): LocalDate? = t?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
internal val WX_WD = listOf("Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør")
internal val WX_WL = listOf("S", "M", "T", "O", "T", "F", "L")
internal fun wxWd(d: LocalDate): String = WX_WD[d.dayOfWeek.value % 7]
internal fun wxWl(d: LocalDate): String = WX_WL[d.dayOfWeek.value % 7]
internal fun wxPad(n: Int) = n.toString().padStart(2, '0')
private val D16 = listOf("N", "NNØ", "NØ", "ØNØ", "Ø", "ØSØ", "SØ", "SSØ", "S", "SSV", "SV", "VSV", "V", "VNV", "NV", "NNV")
/** Sikt i km (serveren sender km; eldre data i meter). */
internal fun wxVisKm(v: Double?): Double? = v?.let { if (it > 200) it / 1000.0 else it }

/** Månefase som i designet: alder i dager (0–29,53) og belyst andel. */
internal fun wxMoonAge(ms: Long): Pair<Double, Double> {
    val age = (((ms / 864e5 - 6.8) % 29.53) + 29.53) % 29.53
    return age to (1 - cos(2 * PI * age / 29.53)) / 2
}
internal fun wxMoonName(age: Double, long: Boolean = false): String = when {
    age < 1.8 -> "Nymåne"; age < 7.4 -> "Voksende sigd"; age < 9.2 -> "Første kvarter"; age < 14 -> "Voksende måne"; age < 15.6 -> "Fullmåne"
    age < 21.2 -> "Avtagende måne"; age < 23 -> "Siste kvarter"; !long || age < 27.7 -> "Avtagende sigd"; else -> "Nymåne"
}

/** Timene for en dato, plassert etter klokkeslett (0–23). */
internal fun wxDayHours(w: WeatherFull, date: String): Array<WxHour?> {
    val a = arrayOfNulls<WxHour>(24)
    w.hours.forEach { h -> if (h.t.startsWith(date.take(10))) wxLdt(h.t)?.hour?.let { a[it] = h } }
    return a
}

/* ---------- Himmel og bakgrunn ---------- */

private fun skyBrush(code: Int, night: Boolean): Brush = Brush.verticalGradient(
    *when {
        night -> arrayOf(0f to Color(0xFF0B1730), .55f to Color(0xFF1C2D52), 1f to Color(0xFF2A3F6A))
        // Prompt 28: klar dag som i fasit (WxFx): #1f5fc4 → #3a82d8 → #6aa8e8 → #9ccaf2.
        code <= 2 -> arrayOf(0f to Color(0xFF1F5FC4), .42f to Color(0xFF3A82D8), .78f to Color(0xFF6AA8E8), 1f to Color(0xFF9CCAF2))
        code == 3 -> arrayOf(0f to Color(0xFF4F6D8F), .55f to Color(0xFF6A87A6), 1f to Color(0xFF9BB0C5))
        code in 51..67 || code in 80..82 || code >= 95 -> arrayOf(0f to Color(0xFF3B4658), .45f to Color(0xFF323D4E), 1f to Color(0xFF2A3342))
        code in 71..77 || code >= 85 -> arrayOf(0f to Color(0xFF5E6B7C), .55f to Color(0xFF7D8A9A), 1f to Color(0xFFA3AEBB))
        // Tåke: mørk grå himmel, så tåkebåndene aldri gir hvit flate bak teksten.
        else -> arrayOf(0f to Color(0xFF3F4D5E), .55f to Color(0xFF556374), 1f to Color(0xFF6F7D8D))
    },
)

private fun fxKind(code: Int, night: Boolean): String = when {
    code in 71..77 || code == 85 || code == 86 -> "snow"
    code in 51..67 || code in 80..82 || code >= 95 -> "rain"
    code == 45 || code == 48 -> "fog"
    code == 3 -> "clouds"
    night -> if (code == 2) "partn" else "stars"
    else -> if (code == 2) "part" else "sun"
}

/* ---------- Glasskort ---------- */

private val cardShape = RoundedCornerShape(24.dp)
private fun Modifier.glass(): Modifier = this.clip(cardShape).background(glassBg).border(1.dp, glassBg, cardShape)

@Composable
private fun CardLabel(icon: String, text: String, fill: Boolean = false, modifier: Modifier = Modifier) {
    Row(modifier.alpha(.7f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        WxIcon(icon, Color.White, 15.dp, stroke = 2f, fill = fill)
        Text(text, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = .08.em, maxLines = 1)
    }
}

/* ================= Siden ================= */

@Composable
internal fun WeatherApp(vm: AppViewModel) {
    // Prompt 25: bred layout (Fold/nettbrett) når bredden er minst 700 dp. Byttes uten ny lasting når Fold åpnes og lukkes.
    BoxWithConstraints(Modifier.fillMaxSize()) { WeatherBody(vm, maxWidth >= 700.dp) }
}

@Composable
private fun WeatherBody(vm: AppViewModel, wide: Boolean) {
    val w = vm.weatherFull
    var ms by remember { mutableStateOf<String?>(null) }
    var msDay by remember { mutableIntStateOf(0) }
    var mapOpen by remember { mutableStateOf(false) }
    var cmpOpen by remember { mutableStateOf(false) }
    BackHandler {
        when {
            mapOpen -> mapOpen = false
            ms != null -> ms = null
            cmpOpen -> cmpOpen = false
            vm.wxPlacesSheet -> vm.wxPlacesSheet = false
            vm.weatherSheetDay != null -> vm.weatherSheetDay = null
            else -> vm.weatherOpen = false
        }
    }
    LaunchedEffect(Unit) { if (vm.wxPlaces.isEmpty()) vm.loadWxPlaces() }
    // Prompt 30: ett lett tikk når Steder, værkartet, Yr mot Storm, dag-popupen eller en detalj-popup lukkes (ikke ved åpning).
    DismissHaptic30(mapOpen)
    DismissHaptic30(ms != null)
    DismissHaptic30(cmpOpen)
    DismissHaptic30(vm.wxPlacesSheet)
    DismissHaptic30(vm.weatherSheetDay != null)
    val state = rememberLazyListState()
    val wideScroll = rememberScrollState()
    val density = LocalDensity.current
    // Scrollposisjon i dp (headeren tones ut over 220 dp, den kompakte linja kommer etter 200 dp).
    val sc by remember(wide) { derivedStateOf {
        if (wide) wideScroll.value / density.density
        else if (state.firstVisibleItemIndex > 0) 10_000f else state.firstVisibleItemScrollOffset / density.density
    } }
    val code = w?.current?.code ?: 2
    val night = w?.current?.isDay == false || (w == null && LocalDateTime.now().hour.let { it < 7 || it >= 18 })
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val open = { k: String -> ms = k; msDay = 0 }
    // Systemfonten (Roboto) gjelder bare værsiden.
    CompositionLocalProvider(LocalTextStyle provides TextStyle(fontFamily = FontFamily.Default, color = Color.White), LocalWxWide25 provides wide) { Box(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().background(skyBrush(code, night))) {
            // Prompt 28: ny bakgrunn (Weather28.kt), sola følger dagens soloppgang og solnedgang.
            WxFx28(fxKind(code, night), heavy = code == 65 || code == 82 || code >= 95, thunder = code >= 95, day = !night, sunF = wxSunF28(w))
            if (wide) WideWeather25(vm, w, wideScroll, top, bottom, { mapOpen = true }, { cmpOpen = true }, open)
            else LazyColumn(
                state = state, modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp, top + 58.dp, 16.dp, bottom + WX_BAR28 + 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (w == null) item {
                    Box(Modifier.fillMaxWidth().padding(60.dp), contentAlignment = Alignment.Center) {
                        vm.weatherError?.let { Text(it, textAlign = TextAlign.Center) } ?: CircularProgressIndicator(color = Color.White)
                    }
                } else {
                    item { Header(w, Modifier.alpha((1f - sc / 220f).coerceIn(0f, 1f))) }
                    // Prompt 32: Forhold-modusene bytter både timeraden og dagslisten (ui/Weather32b.kt).
                    item { HourCard32b(vm, w) { vm.weatherSheetDay = 0 } }
                    item { DaysCard32b(vm, w, { DaysCard(w) { vm.weatherSheetDay = it } }) { vm.weatherSheetDay = it } }
                    item { CmpCard(vm, w) { cmpOpen = true } }
                    item { WindCard(w) { open("wind") } }
                    item { MoonCard { open("moon") } }
                    item { TileRow({ SunTile(w, it) { open("sun") } }, { UvTile(w, it) { open("uv") } }) }
                    item { TileRow({ FeelTile(w, it) { open("feel") } }, { YdTile(w, it) { open("yd") } }) }
                    item { TileRow({ RainTile(w, it) { open("rain") } }, { VisTile(w, it) { open("vis") } }) }
                    item { TileRow({ HumTile(w, it) { open("hum") } }, { PresTile(w, it) { open("pres") } }) }
                    item {
                        val ctx = LocalContext.current
                        Text("Data: MET Norge${if (w.mock) " (eksempeldata)" else ""} · Se også yr.no ↗", fontSize = 12.5.sp, textDecoration = TextDecoration.Underline,
                            textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().alpha(.85f).clickable { openLink(ctx, w.yrUrl ?: "https://www.yr.no/") }.padding(top = 4.dp))
                    }
                }
            }
            TopBar(vm, w, sc > 200f)
            // Prompt 30: to flytende glassknapper nær bunnen (kart til venstre, ☰ Steder til høyre), ingen linje.
            WxBottomBar28(Modifier.align(Alignment.BottomCenter), onMap = { mapOpen = true }, onPlaces = { vm.wxPlacesSheet = true })
        }
        val d = vm.weatherSheetDay
        if (d != null && w != null) ForholdSheet(w, d, { vm.weatherSheetDay = it }) { vm.weatherSheetDay = null }
        val k = ms
        if (k != null && w != null) MetricSheet(w, k, msDay, { msDay = it }) { ms = null }
        if (cmpOpen && w != null) CmpSheet(vm, w) { cmpOpen = false }
        if (vm.wxPlacesSheet) PlacesSheet(vm)
        if (mapOpen) WxMap(w) { mapOpen = false }
    } }
}

@Composable
private fun TopBar(vm: AppViewModel, w: WeatherFull?, compact: Boolean) {
    val cOp by androidx.compose.animation.core.animateFloatAsState(if (compact) 1f else 0f, label = "wxTop")
    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(16.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
        // Prompt 32 (claude-code-vaer-lukk-x.md): ingen «‹ Hjem»; tom plass til venstre så bynavnet står midt, ✕ til høyre.
        Spacer(Modifier.width(42.dp))
        Column(Modifier.weight(1f).alpha(cOp), horizontalAlignment = Alignment.CenterHorizontally) {
            if (w != null) {
                Text(w.place, fontWeight = FontWeight.Bold, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${wxR(w.current.temp)} | ${wxDesc(w.current.code)}", fontSize = 13.sp, modifier = Modifier.alpha(.9f), maxLines = 1)
            }
        }
        WxClose32b { vm.weatherOpen = false }
    }
}

@Composable
private fun Header(w: WeatherFull, modifier: Modifier) {
    val sh = LocalTextStyle.current.copy(shadow = Shadow(Color(0x2E000000), Offset(0f, with(LocalDensity.current) { 2.dp.toPx() }), with(LocalDensity.current) { 20.dp.toPx() }))
    Column(modifier.fillMaxWidth().padding(top = 6.dp, bottom = 26.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("MIN POSISJON", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = .16.em, style = sh, modifier = Modifier.alpha(.85f))
        Text(w.place, fontSize = 36.sp, fontWeight = FontWeight.Medium, lineHeight = 40.sp, style = sh, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(wxR(w.current.temp), fontSize = 112.sp, fontWeight = FontWeight.ExtraLight, lineHeight = 112.sp, letterSpacing = (-.04).em, style = sh,
            modifier = Modifier.padding(start = 22.dp, top = 2.dp))
        Text(wxDesc(w.current.code), fontSize = 19.sp, fontWeight = FontWeight.Bold, style = sh, modifier = Modifier.padding(top = 4.dp))
        Text("H:${wxR(w.today.hi ?: w.days.firstOrNull()?.hi)}  L:${wxR(w.today.lo ?: w.days.firstOrNull()?.lo)}", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, style = sh, modifier = Modifier.alpha(.9f))
        // Prompt 32: kilden og tiden står under H/L (tidligere oppe til høyre).
        val src = if (w.mock) "Eksempeldata" else "MET Norway · yr.no" + (w.updatedAt?.let { u -> runCatching { " · " + java.time.Instant.parse(u).atZone(java.time.ZoneId.systemDefault()).toLocalTime().toString().take(5) }.getOrNull() } ?: "")
        Text(src, fontSize = 11.5.sp, style = sh, modifier = Modifier.alpha(.7f).padding(top = 4.dp), maxLines = 1)
    }
}

/* ---------- Time for time ---------- */

/** De neste 24 timene fra inneværende time. */
internal fun wxNext24(w: WeatherFull): List<WxHour> {
    val now = LocalDateTime.now().withMinute(0).withSecond(0).withNano(0)
    return w.hours.filter { h -> wxLdt(h.t)?.let { !it.isBefore(now) } ?: false }.take(24)
}

@Composable
private fun HourCard(vm: AppViewModel, w: WeatherFull, forhold: () -> Unit) {
    var mode by remember { mutableStateOf("temp") }
    val hrs = wxNext24(w)
    val pent = vm.wxCmp22?.pentHours ?: emptyMap()
    Column(Modifier.fillMaxWidth().glass().padding(top = 14.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = forhold)) {
                Text("Forhold ›", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Text(when (mode) { "rain" -> "Sjanse for nedbør"; "wind" -> "Vind (m/s)"; else -> "Temperatur (°C)" }, fontSize = 12.5.sp, color = wxPp)
            }
            Row(Modifier.clip(CircleShape).background(Color.Black.copy(alpha = .18f)).padding(3.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                listOf("temp" to WX_IC.getValue("part"), "rain" to P_DROP, "wind" to P_WIND).forEach { (k, ic) ->
                    Box(Modifier.size(44.dp, 30.dp).clip(CircleShape).background(if (mode == k) Color.White.copy(alpha = .28f) else Color.Transparent).clickable { Haptics.select(); mode = k },
                        contentAlignment = Alignment.Center) { WxIcon(ic, Color.White, 18.dp, stroke = 1.9f) }
                }
            }
        }
        if (hrs.isEmpty()) Text("Ingen timevarsel.", fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp).alpha(.75f))
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp)) {
            hrs.forEachIndexed { k, h ->
                val hh = wxLdt(h.t)?.hour ?: 0
                val pp = h.precipProb?.roundToInt() ?: 0
                Column(Modifier.width(56.dp).padding(vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(if (k == 0) "Nå" else wxPad(hh), fontSize = 14.sp, fontWeight = if (k == 0) FontWeight.ExtraBold else FontWeight.Bold)
                    WxCodeIcon(wxKey(h.code, !h.isDay), 28.dp)
                    Text(if (pp >= 20) "$pp %" else "", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = wxPp, modifier = Modifier.heightIn(min = 13.dp), lineHeight = 13.sp)
                    Text(when (mode) { "rain" -> "$pp %"; "wind" -> "${(h.wind ?: 0.0).roundToInt()}"; else -> wxR(h.temp) }, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                    // Pent i oransje under Yr, så avvik ses med en gang.
                    val pt = if (mode == "temp") pent[h.t.take(13)] else null
                    Text(pt?.let { "${it.roundToInt()}°" } ?: "", fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFFFFB27A), modifier = Modifier.heightIn(min = 15.dp), lineHeight = 15.sp)
                }
            }
        }
    }
}

/* ---------- 7 dager ---------- */

@Composable
private fun DaysCard(w: WeatherFull, open: (Int) -> Unit) {
    val days = w.days.take(7)
    if (days.isEmpty()) return
    val lo = days.mapNotNull { it.lo }.minOrNull() ?: 0.0
    val hi = days.mapNotNull { it.hi }.maxOrNull() ?: 10.0
    val sp = (hi - lo).coerceAtLeast(1.0)
    Column(Modifier.fillMaxWidth().glass().padding(horizontal = 16.dp, vertical = 4.dp)) {
        days.forEachIndexed { k, d ->
            if (k > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = .18f)))
            Row(Modifier.fillMaxWidth().clickable { open(k) }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (k == 0) "I dag" else wxLd(d.date)?.let(::wxWd) ?: "", fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(52.dp), maxLines = 1)
                Column(Modifier.width(40.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    WxCodeIcon(wxKey(d.code, false), 24.dp)
                    val pp = d.precipProb?.roundToInt() ?: 0
                    if (pp >= 30) Text("$pp %", fontSize = 10.5.sp, fontWeight = FontWeight.ExtraBold, color = wxPp, lineHeight = 12.sp)
                }
                Text(wxR(d.lo), fontSize = 17.sp, fontWeight = FontWeight.Bold, color = wxBlue, textAlign = TextAlign.End, modifier = Modifier.width(38.dp))
                val l = (((d.lo ?: lo) - lo) / sp).toFloat()
                val wd = (((d.hi ?: hi) - (d.lo ?: lo)) / sp).toFloat().coerceAtLeast(.08f)
                val nowL = if (k == 0) w.current.temp?.let { ((it - lo) / sp).toFloat().coerceIn(0f, 1f) } else null
                Canvas(Modifier.weight(1f).height(12.dp)) {
                    val h = 6.dp.toPx()
                    val y0 = (size.height - h) / 2
                    drawRoundRect(Color.Black.copy(alpha = .18f), Offset(0f, y0), Size(size.width, h), CornerRadius(h / 2))
                    val x0 = size.width * l
                    val ww = (size.width * wd).coerceAtMost(size.width - x0)
                    drawRoundRect(Brush.horizontalGradient(listOf(Color(0xFF7FD6F5), Color(0xFFA6E3B0), Color(0xFFFFD36B)), startX = x0, endX = x0 + ww), Offset(x0, y0), Size(ww, h), CornerRadius(h / 2))
                    nowL?.let {
                        val c = Offset(size.width * it, size.height / 2)
                        drawCircle(Color.White, 6.dp.toPx(), c)
                        drawCircle(Color(0x99285A96), 5.dp.toPx(), c, style = Stroke(2.dp.toPx()))
                    }
                }
                Text(wxR(d.hi), fontSize = 17.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.End, modifier = Modifier.width(38.dp))
            }
        }
    }
}

/* ---------- Yr og Storm (prompt 30: «Pent» heter Storm) ---------- */

internal data class CmpRow(val d: String, val yKey: String, val yt: String, val yp: String, val sKey: String?, val st: String, val sp: String, val df: String, val dbg: Color)
internal data class CmpView(val ready: Boolean, val agC: Color, val agT: String, val agS: String, val rows: List<CmpRow>)

private fun mm(v: Double?) = if (v == null) "–" else wxF1(v) + " mm"

/** Rader og enighet som cmpVals i designet. */
internal fun cmpView(vm: AppViewModel, w: WeatherFull): CmpView {
    val c = vm.wxCmp22 ?: return CmpView(false, Color(0xFF9AA3AE), if (vm.wxCmp22Failed) "Storm svarte ikke" else "Henter …", "", emptyList())
    val byDate = c.days.associateBy { it.date.take(10) }
    val diffs = ArrayList<Double>()
    val rows = w.days.take(7).mapIndexed { k, d ->
        val x = byDate[d.date.take(10)]
        val yh = x?.yr?.max ?: d.hi
        val yl = x?.yr?.min ?: d.lo
        val s = x?.pent
        val sh = s?.max
        val df = if (yh != null && sh != null) { diffs.add(abs(yh - sh)); (yh - sh).roundToInt() } else null
        val sKey = s?.let { it.icon ?: it.code?.let { cd -> wxKey(cd, false) } ?: wxKey(d.code, false) }
        CmpRow(
            if (k == 0) "I dag" else wxLd(d.date)?.let(::wxWd) ?: "", x?.yr?.icon ?: wxKey(x?.yr?.code ?: d.code, false),
            "${wxR(yh)} / ${wxR(yl)}", mm(x?.yr?.precip ?: d.precipSum), sKey,
            if (s != null) "${wxR(sh)} / ${wxR(s.min)}" else "–", if (s != null) mm(s.precip) else "–",
            if (df == null) "–" else (if (df > 0) "+" else "") + "$df°",
            when { df == null || abs(df) < 2 -> Color.White.copy(alpha = .1f); abs(df) < 4 -> Color(0x4DFFB347); else -> Color(0x66F26B5E) },
        )
    }
    val avg = c.avgDiff ?: if (diffs.isNotEmpty()) diffs.average() else when (c.agreement) { "good" -> 1.0; "mid" -> 2.0; "bad" -> 3.5; else -> 0.0 }
    val col = if (avg < 1.5) Color(0xFF6FDC8C) else if (avg < 3) Color(0xFFFFB347) else Color(0xFFF26B5E)
    val t = if (avg < 1.5) "Yr og Storm er enige" else if (avg < 3) "Litt uenige · ${wxF1(avg)}° i snitt" else "Uenige · ${wxF1(avg)}° i snitt"
    return CmpView(true, col, t, "Snitt avvik i makstemperatur: ${wxF1(avg)}° over ${diffs.size} dager", rows)
}

@Composable
internal fun CmpTableRow(r: CmpRow, line: Color, dayW: Dp, chipW: Dp) {
    Column {
        Box(Modifier.fillMaxWidth().height(1.dp).background(line))
        Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(r.d, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(dayW), maxLines = 1)
            CmpCell(r.yKey, r.yt, r.yp, Modifier.weight(1f))
            CmpCell(r.sKey, r.st, r.sp, Modifier.weight(1f))
            Box(Modifier.width(chipW), contentAlignment = Alignment.CenterEnd) {
                Text(r.df, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(r.dbg).padding(7.dp, 3.dp))
            }
        }
    }
}

@Composable
private fun CmpCell(key: String?, t: String, p: String, modifier: Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (key != null) WxCodeIcon(key, 22.dp) else Spacer(Modifier.size(22.dp))
        Column {
            Text(t, fontSize = 14.5.sp, fontWeight = FontWeight.Bold, maxLines = 1, softWrap = false)
            Text(p, fontSize = 11.5.sp, color = wxPp, maxLines = 1, softWrap = false)
        }
    }
}

@Composable
internal fun CmpHead(yr: Color, pent: Color, mut: Color, dayW: Dp, chipW: Dp, modifier: Modifier = Modifier, logo: Dp? = null) {
    // Prompt 30: «Pent» heter Storm; i fullskjerm står en liten logo (18 dp) foran YR og STORM.
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Spacer(Modifier.width(dayW))
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (logo != null) BrandLogo30("yr", logo)
            Text("YR", color = yr, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = .08.em)
        }
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (logo != null) BrandLogo30("storm", logo)
            Text("STORM", color = pent, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = .08.em)
        }
        Text("AVVIK", color = mut, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = .08.em, textAlign = TextAlign.End, modifier = Modifier.width(chipW))
    }
}

@Composable
private fun CmpCard(vm: AppViewModel, w: WeatherFull, openIt: () -> Unit) {
    val v = cmpView(vm, w)
    // Prompt 30: hele kortet åpner Yr mot Storm i fullskjerm; ekte logoer (30 dp, overlappende) i stedet for bokstavsirkler.
    Column(Modifier.fillMaxWidth().glass().clickable(onClickLabel = "Yr mot Storm") { Haptics.select(); openIt() }.padding(16.dp, 14.dp, 16.dp, 6.dp)) {
        Row(Modifier.padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Row {
                BrandLogo30("yr", 30.dp)
                BrandLogo30("storm", 30.dp, Modifier.offset(x = (-8).dp))
            }
            Column(Modifier.weight(1f)) {
                Text("Yr og Storm", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Row(Modifier.alpha(.85f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(v.agC))
                    Text(v.agT, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        if (v.ready) {
            CmpHead(Color(0xFF7FD6F5), Color(0xFFFFB27A), Color.White, 44.dp, 40.dp, Modifier.alpha(.8f).padding(bottom = 6.dp))
            v.rows.take(4).forEach { CmpTableRow(it, Color.White.copy(alpha = .18f), 44.dp, 40.dp) }
        }
        if (vm.wxCmp22Busy) Text("Henter Storm …", fontSize = 13.sp, modifier = Modifier.alpha(.75f).padding(top = 8.dp, bottom = 10.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = .18f)))
        Row(Modifier.fillMaxWidth().heightIn(min = 44.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Time for time og hele uka", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text("›", fontSize = 14.sp, modifier = Modifier.alpha(.7f))
        }
    }
}

@Composable
private fun Badge(t: String, c: Color, modifier: Modifier) {
    Box(modifier.size(28.dp).clip(CircleShape).background(c).border(2.dp, Color.White.copy(alpha = .7f), CircleShape), contentAlignment = Alignment.Center) {
        Text(t, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
    }
}

/* ---------- Vind og måne ---------- */

@Composable
private fun KvRows(rows: List<Pair<String, String>>) {
    rows.forEachIndexed { i, (a, b) ->
        if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = .2f)))
        Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(a, fontSize = 15.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), maxLines = 1)
            Text(b, fontSize = 15.5.sp, fontWeight = FontWeight.Bold, color = wxBlue, maxLines = 1, softWrap = false)
        }
    }
}

/** Tekst i et SVG-koordinatsystem: x er ankeret (start, midt eller slutt), y er grunnlinjen. Størrelse i SVG-enheter. */
internal fun DrawScope.svgText(tm: TextMeasurer, t: String, x: Float, y: Float, k: Float, size: Float, color: Color, weight: FontWeight = FontWeight.Bold, anchor: Int = 0, alpha: Float = 1f) {
    val r = tm.measure(t, TextStyle(color = color.copy(alpha = color.alpha * alpha), fontSize = (size * k).toSp(), fontWeight = weight, fontFamily = FontFamily.Default))
    val px = x * k - when (anchor) { 1 -> r.size.width / 2f; 2 -> r.size.width.toFloat(); else -> 0f }
    drawText(r, topLeft = Offset(px, y * k - r.firstBaseline))
}

@Composable
private fun WindCard(w: WeatherFull, onClick: () -> Unit) {
    val c = w.current
    val dir = c.windDir ?: 0.0
    val tm = rememberTextMeasurer()
    Row(Modifier.fillMaxWidth().glass().clickable(onClick = onClick).padding(16.dp, 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(Modifier.weight(1f)) {
            CardLabel(P_WIND, "VIND", modifier = Modifier.padding(bottom = 6.dp))
            KvRows(listOf("Vind" to "${wxF1(c.wind)} m/s", "Kast" to "${wxF1(c.gust ?: c.wind?.let { it * 1.6 })} m/s", "Retning" to "${dir.roundToInt()}° ${D16[(dir / 22.5).roundToInt() % 16]}"))
        }
        Canvas(Modifier.size(128.dp)) {
            val k = size.width / 100f
            drawCircle(Color.White.copy(alpha = .35f), 42 * k, Offset(50 * k, 50 * k), style = Stroke(7 * k, pathEffect = PathEffect.dashPathEffect(floatArrayOf(.8f * k, 2.5f * k))))
            svgText(tm, "N", 50f, 12f, k, 8f, Color.White, FontWeight.ExtraBold, 1)
            svgText(tm, "Ø", 91f, 53f, k, 8f, Color.White, FontWeight.ExtraBold, 1, .75f)
            svgText(tm, "S", 50f, 97f, k, 8f, Color.White, FontWeight.ExtraBold, 1, .75f)
            svgText(tm, "V", 9f, 53f, k, 8f, Color.White, FontWeight.ExtraBold, 1, .75f)
            rotate(dir.toFloat(), Offset(50 * k, 50 * k)) {
                drawCircle(Color.White, 3.2f * k, Offset(50 * k, 12 * k))
                drawLine(Color.White, Offset(50 * k, 15 * k), Offset(50 * k, 34 * k), 2 * k)
                drawLine(Color.White, Offset(50 * k, 66 * k), Offset(50 * k, 86 * k), 2 * k)
                val head = Path().apply { moveTo(45 * k, 80 * k); lineTo(50 * k, 89 * k); lineTo(55 * k, 80 * k) }
                drawPath(head, Color.White, style = Stroke(2 * k, join = StrokeJoin.Round))
            }
            drawCircle(Color(0x5914325A), 19 * k, Offset(50 * k, 50 * k))
            svgText(tm, wxF1(c.wind), 50f, 51f, k, 14f, Color.White, FontWeight.ExtraBold, 1)
            svgText(tm, "m/s", 50f, 61f, k, 7.5f, Color.White, FontWeight.Bold, 1)
        }
    }
}

/** Den lyse delen av månen (56×56), som «lit» i designet. */
internal fun moonLitPath(age: Double, ill: Double): Path {
    val wax = age < 14.77
    val kx = abs(1 - 2 * ill) * 24
    return PathParser().parsePathString("M28 4 A24 24 0 0 ${if (wax) 1 else 0} 28 52 A${String.format(Locale.US, "%.1f", kx)} 24 0 0 ${if ((ill > .5) == wax) 1 else 0} 28 4 Z").toPath()
}

@Composable
internal fun MoonDisc(age: Double, ill: Double, size: Dp) {
    val lit = remember(age, ill) { moonLitPath(age, ill) }
    Canvas(Modifier.size(size)) {
        val k = this.size.width / 56f
        scale(k, k, pivot = Offset.Zero) {
            drawCircle(Color(0x8C142846), 24f, Offset(28f, 28f))
            drawPath(lit, Color(0xFFE9EEF5))
            drawCircle(Color(0x40788CAA), 3f, Offset(20f, 20f))
            drawCircle(Color(0x38788CAA), 4.5f, Offset(33f, 33f))
            drawCircle(Color(0x40788CAA), 2f, Offset(34f, 18f))
            drawCircle(Color(0x33788CAA), 2.4f, Offset(22f, 38f))
        }
    }
}

@Composable
private fun MoonCard(onClick: () -> Unit) {
    val (age, ill) = remember { wxMoonAge(System.currentTimeMillis()) }
    val toFull = ((((14.77 - age) % 29.53) + 29.53) % 29.53).roundToInt()
    val toNew = (29.53 - age).roundToInt()
    Row(Modifier.fillMaxWidth().glass().clickable(onClick = onClick).padding(16.dp, 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(Modifier.weight(1f)) {
            Row(Modifier.alpha(.7f).padding(bottom = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Canvas(Modifier.size(15.dp)) {
                    val k = size.width / 24f
                    drawCircle(Color.White, 9 * k, Offset(12 * k, 12 * k), style = Stroke(2 * k))
                    drawArc(Color.White, -90f, 180f, true, Offset(3 * k, 3 * k), Size(18 * k, 18 * k))
                }
                Text(wxMoonName(age).uppercase(wxNb), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = .08.em, maxLines = 1)
            }
            KvRows(listOf("Belyst" to "${(ill * 100).roundToInt()} %", "Neste fullmåne" to if (toFull <= 0) "I dag" else "$toFull dager", "Neste nymåne" to "$toNew dager"))
        }
        MoonDisc(age, ill, 120.dp)
    }
}

/* ---------- Flisene (2 per rad, minst 176 dp høye) ---------- */

@Composable
private fun TileRow(a: @Composable (Modifier) -> Unit, b: @Composable (Modifier) -> Unit) {
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        a(Modifier.weight(1f).fillMaxHeight().heightIn(min = 176.dp))
        b(Modifier.weight(1f).fillMaxHeight().heightIn(min = 176.dp))
    }
}

@Composable
private fun Tile(modifier: Modifier, onClick: () -> Unit, gap: Dp = 4.dp, pad: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.glass().clickable(onClick = onClick).padding(vertical = 14.dp, horizontal = if (pad) 16.dp else 0.dp), verticalArrangement = Arrangement.spacedBy(gap), content = content)
}

@Composable
private fun Big(t: String) = Text(t, fontSize = 32.sp, fontWeight = FontWeight.Bold, maxLines = 1, softWrap = false, lineHeight = 36.sp)

@Composable
private fun ColumnScope.Bottom(t: String) {
    Spacer(Modifier.weight(1f))
    Text(t, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, lineHeight = 19.sp)
}

private fun hourOf(s: String?): Double? = wxLdt(s)?.let { it.hour + it.minute / 60.0 }

@Composable
private fun SunTile(w: WeatherFull, modifier: Modifier, onClick: () -> Unit) {
    val today = w.days.firstOrNull()
    val rise = today?.sunrise ?: w.today.sunrise
    val set = today?.sunset ?: w.today.sunset
    val now = LocalDateTime.now()
    val nh = now.hour + now.minute / 60.0
    val rh = hourOf(rise) ?: 8.0
    val shh = hourOf(set) ?: 18.0
    val afterSet = nh > shh
    val beforeRise = nh < rh
    val nextRise = if (afterSet) w.days.getOrNull(1)?.sunrise ?: rise else rise
    Tile(modifier, onClick, pad = false) {
        CardLabel("M3 18h18M7 14a5 5 0 0 1 10 0M12 4v3M5 8l1.5 1.5M19 8l-1.5 1.5", if (afterSet || beforeRise) "SOLOPPGANG" else "SOLNEDGANG", modifier = Modifier.padding(horizontal = 16.dp))
        Box(Modifier.padding(horizontal = 16.dp)) { Big(if (afterSet || beforeRise) wxHm(nextRise) else wxHm(set)) }
        Spacer(Modifier.weight(1f))
        val noon = (rh + shh) / 2
        fun el(h: Double) = cos(2 * PI * (h - noon) / 24) - cos(2 * PI * (rh - noon) / 24)
        val eMax = el(noon)
        val eMin = el(noon + 12)
        fun yOf(h: Double) = (6 + (eMax - el(h)) / (eMax - eMin).let { if (it == 0.0) 1.0 else it } * 40).toFloat()
        Canvas(Modifier.fillMaxWidth().height(52.dp)) {
            val sx = size.width / 120f
            val sy = size.height / 50f
            drawLine(Color.White.copy(alpha = .45f), Offset(0f, yOf(rh) * sy), Offset(size.width, yOf(rh) * sy), 1.dp.toPx())
            val p = Path()
            for (k in 0..48) { val h = k / 2.0; val x = (h / 24 * 120).toFloat() * sx; val y = yOf(h) * sy; if (k == 0) p.moveTo(x, y) else p.lineTo(x, y) }
            drawPath(p, Color.White.copy(alpha = .55f), style = Stroke(2.2.dp.toPx()))
            drawCircle(Color.White, 4.5.dp.toPx(), Offset((nh / 24 * 120).toFloat() * sx, yOf(nh) * sy))
        }
        Text(if (afterSet || beforeRise) "Solnedgang: ${wxHm(set)}" else "Soloppgang: ${wxHm(rise)}", fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 16.dp))
    }
}

@Composable
private fun UvTile(w: WeatherFull, modifier: Modifier, onClick: () -> Unit) {
    val uv = (w.current.uv ?: w.days.firstOrNull()?.uvMax ?: 0.0).roundToInt()
    Tile(modifier, onClick, gap = 6.dp) {
        CardLabel("M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5", "UV-INDEKS")
        Text("$uv", fontSize = 32.sp, fontWeight = FontWeight.Bold, lineHeight = 32.sp)
        Text(when { uv < 3 -> "Lav"; uv < 6 -> "Moderat"; uv < 8 -> "Høy"; uv < 11 -> "Svært høy"; else -> "Ekstrem" }, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.weight(1f))
        Canvas(Modifier.fillMaxWidth().height(10.dp)) {
            val h = 6.dp.toPx()
            val y0 = (size.height - h) / 2
            drawRoundRect(Brush.horizontalGradient(listOf(Color(0xFF5BD08A), Color(0xFFFFE066), Color(0xFFFF9A3D), Color(0xFFFF4D6D), Color(0xFFC86BFF))), Offset(0f, y0), Size(size.width, h), CornerRadius(h / 2))
            val c = Offset(size.width * (uv / 11f).coerceIn(0f, 1f), size.height / 2)
            drawCircle(Color.Black.copy(alpha = .15f), 7.dp.toPx(), c)
            drawCircle(Color.White, 5.dp.toPx(), c)
        }
        Text(if (uv < 3) "Lave nivåer hele dagen." else "Bruk solkrem midt på dagen.", fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun FeelTile(w: WeatherFull, modifier: Modifier, onClick: () -> Unit) {
    val diff = (w.current.feels ?: 0.0) - (w.current.temp ?: 0.0)
    Tile(modifier, onClick, gap = 6.dp) {
        CardLabel("M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z", "FØLES SOM")
        Big(wxR(w.current.feels))
        Bottom(when { abs(diff) < 1 -> "Omtrent som den faktiske temperaturen."; diff < 0 -> "Føles kaldere enn faktisk, på grunn av vind."; else -> "Føles varmere enn den faktiske temperaturen." })
    }
}

@Composable
private fun YdTile(w: WeatherFull, modifier: Modifier, onClick: () -> Unit) {
    val a = w.days.firstOrNull()?.hi ?: w.today.hi
    val b = w.yHi
    val yd = if (a != null && b != null) a - b else 0.0
    Tile(modifier, onClick, gap = 6.dp) {
        CardLabel("M3 20h18M5 16l4-4 3 3 7-7", "MOT I GÅR")
        Big(if (b == null) "–" else (if (yd >= 0) "+" else "−") + "${abs(yd.roundToInt())}°")
        Text(when { b == null -> "Mangler gårsdagen"; yd.roundToInt() == 0 -> "Like varmt som i går"; yd > 0 -> "Varmere enn i går"; else -> "Kaldere enn i går" },
            fontSize = 14.sp, fontWeight = FontWeight.Bold, lineHeight = 18.sp)
        Spacer(Modifier.weight(1f))
        Row { Text("I dag", fontSize = 13.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f).alpha(.7f)); Text("H:${wxR(a)}", fontSize = 13.5.sp, fontWeight = FontWeight.Bold) }
        Row { Text("I går", fontSize = 13.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f).alpha(.7f)); Text("H:${wxR(b)}", fontSize = 13.5.sp, fontWeight = FontWeight.Bold) }
    }
}

@Composable
private fun RainTile(w: WeatherFull, modifier: Modifier, onClick: () -> Unit) {
    val days = w.days.take(7)
    val nx = days.drop(1).firstOrNull { (it.precipSum ?: 0.0) >= 0.5 }
    Tile(modifier, onClick) {
        CardLabel(P_DROP, "NEDBØR", fill = true)
        Big("${wxF1(days.firstOrNull()?.precipSum ?: w.today.precipSum ?: 0.0)} mm")
        Text("I dag", fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Bottom(if (nx != null) "Neste ventet er ${wxF1(nx.precipSum)} mm ${wxLd(nx.date)?.let(::wxWd)?.lowercase(wxNb) ?: ""}." else "Ingen nedbør ventet de neste dagene.")
    }
}

@Composable
private fun VisTile(w: WeatherFull, modifier: Modifier, onClick: () -> Unit) {
    val km = wxVisKm(w.current.visibility) ?: 20.0
    Tile(modifier, onClick) {
        Row(Modifier.alpha(.7f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Canvas(Modifier.size(15.dp)) {
                val k = size.width / 24f
                scale(k, k, pivot = Offset.Zero) {
                    drawPath(wxPath("M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"), Color.White, style = Stroke(2f))
                    drawCircle(Color.White, 3f, Offset(12f, 12f), style = Stroke(2f))
                }
            }
            Text("SIKT", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = .08.em)
        }
        Big(if (km >= 30) "+${km.roundToInt()} km" else if (km >= 10) "${km.roundToInt()} km" else "${wxF1(km)} km")
        Bottom(if (km >= 20) "Helt klar sikt." else if (km >= 10) "God sikt." else if (km >= 4) "Moderat sikt." else "Dårlig sikt.")
    }
}

@Composable
private fun HumTile(w: WeatherFull, modifier: Modifier, onClick: () -> Unit) {
    val rh = w.current.humidity ?: 0.0
    val dew = w.current.dew ?: ((w.current.temp ?: 0.0) - (100 - rh) / 5)
    Tile(modifier, onClick) {
        CardLabel("M3 9h11a3 3 0 1 0-3-3M3 14h15M3 19h9", "LUFTFUKTIGHET")
        Big("${rh.roundToInt()} %")
        Bottom("Duggpunktet er ${dew.roundToInt()}° akkurat nå.")
    }
}

@Composable
private fun PresTile(w: WeatherFull, modifier: Modifier, onClick: () -> Unit) {
    val pr = w.current.pressure ?: 1013.0
    val pf = ((pr - 960) / (1060 - 960)).toFloat().coerceIn(0f, 1f)
    val arrow = when (w.current.pressureTrend) { "up" -> "↑"; "down" -> "↓"; else -> "→" }
    val tm = rememberTextMeasurer()
    Tile(modifier, onClick, gap = 2.dp) {
        Row(Modifier.alpha(.7f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Canvas(Modifier.size(15.dp)) {
                val k = size.width / 24f
                drawCircle(Color.White, 9 * k, Offset(12 * k, 12 * k), style = Stroke(2 * k))
                drawLine(Color.White, Offset(12 * k, 12 * k), Offset(16 * k, 8 * k), 2 * k, StrokeCap.Round)
            }
            Text("LUFTTRYKK", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = .08.em)
        }
        Canvas(Modifier.fillMaxWidth().height(118.dp)) {
            val k = minOf(size.width / 100f, size.height / 86f)
            translate((size.width - 100 * k) / 2, (size.height - 86 * k) / 2) {
                val circ = (2 * PI * 38).toFloat() * k
                drawCircle(Color.White.copy(alpha = .35f), 38 * k, Offset(50 * k, 50 * k),
                    style = Stroke(8 * k, pathEffect = PathEffect.dashPathEffect(floatArrayOf(circ * .009f, circ * .024f))))
                rotate(-135f + pf * 270f, Offset(50 * k, 50 * k)) { drawLine(Color.White, Offset(50 * k, 9 * k), Offset(50 * k, 20 * k), 3 * k, StrokeCap.Round) }
                svgText(tm, arrow, 50f, 40f, k, 12f, Color.White, FontWeight.ExtraBold, 1)
                svgText(tm, String.format(wxNb, "%,d", pr.roundToInt()).replace(' ', ' '), 50f, 56f, k, 15f, Color.White, FontWeight.ExtraBold, 1)
                svgText(tm, "hPa", 50f, 66f, k, 8f, Color.White, FontWeight.Bold, 1)
                svgText(tm, "Lavt", 26f, 84f, k, 8f, Color.White, FontWeight.Bold, 1)
                svgText(tm, "Høyt", 74f, 84f, k, 8f, Color.White, FontWeight.Bold, 1)
            }
        }
    }
}

/* ---------- Prompt 25: værsiden på Fold og nettbrett (≥ 700 dp) ---------- */

/**
 * To kolonner (5 : 7, maks 1280, 24 dp kantmarg, 20 dp mellom). Venstre: sted og temperatur (tones ikke ut), time for time
 * og 10 dager. Høyre: værkart rett på siden, Yr mot Pent, vind og måne, og flisene i 3 kolonner. Kildelenken nederst over begge.
 */
@Composable
private fun WideWeather25(
    vm: AppViewModel, w: WeatherFull?, scroll: androidx.compose.foundation.ScrollState, top: Dp, bottom: Dp,
    openMap: () -> Unit, openCmp: () -> Unit, open: (String) -> Unit,
) {
    Column(
        Modifier.fillMaxSize().verticalScroll(scroll).padding(top = top + 58.dp, bottom = bottom + WX_BAR28 + 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(Modifier.widthIn(max = 1280.dp).fillMaxWidth().padding(horizontal = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            if (w == null) {
                Box(Modifier.fillMaxWidth().padding(60.dp), contentAlignment = Alignment.Center) {
                    vm.weatherError?.let { Text(it, textAlign = TextAlign.Center) } ?: CircularProgressIndicator(color = Color.White)
                }
                return@Column
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                Column(Modifier.weight(5f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Header(w, Modifier)
                    HourCard32b(vm, w) { vm.weatherSheetDay = 0 }
                    DaysCard32b(vm, w, { DaysCard(w) { vm.weatherSheetDay = it } }) { vm.weatherSheetDay = it }
                }
                Column(Modifier.weight(7f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    WxMapInline25(w, Modifier.fillMaxWidth().height(300.dp).clip(cardShape).border(1.dp, glassBg, cardShape), openMap)
                    CmpCard(vm, w, openCmp)
                    WindCard(w) { open("wind") }
                    MoonCard { open("moon") }
                    TileRow3({ SunTile(w, it) { open("sun") } }, { UvTile(w, it) { open("uv") } }, { FeelTile(w, it) { open("feel") } })
                    TileRow3({ YdTile(w, it) { open("yd") } }, { RainTile(w, it) { open("rain") } }, { VisTile(w, it) { open("vis") } })
                    TileRow3({ HumTile(w, it) { open("hum") } }, { PresTile(w, it) { open("pres") } }, null)
                }
            }
            val ctx = LocalContext.current
            Text("Data: MET Norge${if (w.mock) " (eksempeldata)" else ""} · Se også yr.no ↗", fontSize = 12.5.sp, textDecoration = TextDecoration.Underline,
                textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().alpha(.85f).clickable { openLink(ctx, w.yrUrl ?: "https://www.yr.no/") }.padding(top = 4.dp))
        }
    }
}

/** Tre fliser i bredden (Fold). En tom plass holdes åpen, så flisene får lik bredde. */
@Composable
private fun TileRow3(a: @Composable (Modifier) -> Unit, b: @Composable (Modifier) -> Unit, c: (@Composable (Modifier) -> Unit)?) {
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        a(Modifier.weight(1f).fillMaxHeight().heightIn(min = 176.dp))
        b(Modifier.weight(1f).fillMaxHeight().heightIn(min = 176.dp))
        if (c != null) c(Modifier.weight(1f).fillMaxHeight().heightIn(min = 176.dp)) else Spacer(Modifier.weight(1f))
    }
}

package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/*
 * Værappen (design/Vaer.dc.html v2): stor sentrert header som tones ut ved scroll, timekort (temperatur, nedbør, vind),
 * 7 dager med min–maks-søyler, fliser (vind, måne, sol, UV, føles som, mot i går, nedbør, sikt, fuktighet, lufttrykk),
 * stedsvelger og «Forhold»-arket med temperaturgraf og sjanse for nedbør. Data fra GET /api/weather/full (Open-Meteo).
 */

private val nb = Locale("nb", "NO")
private val glass = Color.White.copy(alpha = .13f)
private val glassLine = Color.White.copy(alpha = .18f)
private val dim = Color.White.copy(alpha = .72f)

private fun sky(kind: String): List<Color> = when (kind) {
    "clear" -> listOf(Color(0xFF2F6FC4), Color(0xFF5E98DA), Color(0xFF9CC4EC))
    "rain" -> listOf(Color(0xFF34404D), Color(0xFF4A5868), Color(0xFF66778A))
    "snow" -> listOf(Color(0xFF6E8299), Color(0xFF93A6BA), Color(0xFFB9C8D6))
    "fog" -> listOf(Color(0xFF6F7A85), Color(0xFF8C97A2), Color(0xFFA9B3BC))
    "night" -> listOf(Color(0xFF0A1222), Color(0xFF14223A), Color(0xFF22324E))
    else -> listOf(Color(0xFF4C5C6E), Color(0xFF6C7D90), Color(0xFF8E9DAD))
}

private fun deg(v: Double?) = v?.let { "${it.roundToInt()}°" } ?: "–"
private fun hhmm(iso: String?): String = iso?.let { if (it.length >= 16) it.substring(11, 16) else it } ?: "–"
private fun ldt(t: String): LocalDateTime? = runCatching { LocalDateTime.parse(t.take(16)) }.getOrNull()

@Composable
private fun WxCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) =
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(glass).border(1.dp, glassLine, RoundedCornerShape(20.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp), content = content)

@Composable
private fun WxLabel(text: String) = Text(text.uppercase(nb), color = dim, fontFamily = PaperFonts.mono, fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp)

@Composable
private fun WxBig(text: String, size: Int = 30) = Text(text, color = Color.White, fontFamily = PaperFonts.serif, fontSize = size.sp, maxLines = 1)

@Composable
internal fun WeatherApp(vm: AppViewModel) {
    val ctx = LocalContext.current
    BackHandler { if (vm.weatherSheetDay != null) vm.weatherSheetDay = null else vm.weatherOpen = false }
    val w = vm.weatherFull
    val state = rememberLazyListState()
    val fade by remember { derivedStateOf { if (state.firstVisibleItemIndex > 0) 1f else (state.firstVisibleItemScrollOffset / 260f).coerceIn(0f, 1f) } }
    var mode by remember { mutableStateOf("temp") }
    LaunchedEffect(Unit) { if (vm.wxPlaces.isEmpty()) vm.loadWxPlaces(); state.scrollToItem(0) }
    if (vm.wxPlacesSheet) WxPlacesSheet(vm)
    val kind = w?.kind ?: "cloudy"
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(sky(kind)))) {
        if (kind == "clear") Box(Modifier.fillMaxWidth().height(260.dp).background(Brush.radialGradient(listOf(Color(0x66FFE7A0), Color.Transparent), center = Offset(820f, 40f), radius = 700f)))
        val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
        LazyColumn(state = state, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, top + 54.dp, 16.dp, 48.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (w == null) {
                item {
                    Box(Modifier.fillMaxWidth().padding(60.dp), contentAlignment = Alignment.Center) {
                        vm.weatherError?.let { Text(it, color = Color.White, textAlign = TextAlign.Center) } ?: CircularProgressIndicator(color = Color.White)
                    }
                }
            } else {
                item { WxHeader(w, Modifier.alpha(1f - fade)) }
                item { HourCard(w, mode, { mode = it }) { vm.weatherSheetDay = 0 } }
                item { DaysCard(w) { vm.weatherSheetDay = it } }
                item { WindTile(w) }
                w.moon?.let { m -> item { MoonTile(m) } }
                val tiles: List<@Composable (Modifier) -> Unit> = listOf(
                    { m -> SunTile(w, m) }, { m -> UvTile(w, m) }, { m -> FeelsTile(w, m) }, { m -> YesterdayTile(w, m) },
                    { m -> RainTile(w, m) }, { m -> VisTile(w, m) }, { m -> HumTile(w, m) }, { m -> PressTile(w, m) },
                )
                val rows = tiles.chunked(2)
                items(rows.size) { i ->
                    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        rows[i].forEach { t -> t(Modifier.weight(1f).fillMaxHeight()) }
                    }
                }
                item {
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        // Egne steder (søk, legg til og fjern under «+ Sted»). Eldre server: de fire faste byene.
                        val places = vm.wxPlaces.ifEmpty { WX_PLACES.map { (id, n) -> WxPlace(id, n, 0.0, 0.0, "") } }
                        places.forEach { pl ->
                            val on = vm.weatherPlace == pl.id
                            Box(Modifier.height(36.dp).clip(CircleShape).background(if (on) Color.White else glass).clickable { Haptics.select(); vm.loadWeatherAt(pl) }.padding(horizontal = 16.dp),
                                contentAlignment = Alignment.Center) { Text(pl.name, color = if (on) Color(0xFF1B2A40) else Color.White, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1) }
                        }
                        Box(Modifier.height(36.dp).clip(CircleShape).background(glass).clickable { Haptics.select(); vm.wxPlacesSheet = true }.padding(horizontal = 16.dp),
                            contentAlignment = Alignment.Center) { Text("+ Sted", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp) }
                    }
                }
                item {
                    Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(48.dp).clip(RoundedCornerShape(16.dp)).background(glass).clickable { Haptics.select(); vm.openCompare() },
                        contentAlignment = Alignment.Center) { Text("Sammenlign Yr og Storm ›", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp) }
                }
                item {
                    Text("Data: MET Norge${if (w.mock) " (eksempeldata)" else ""} · Se også yr.no ↗", color = dim, fontSize = 12.sp, textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().clickable { openLink(ctx, w.yrUrl ?: "https://www.yr.no/nb") }.padding(8.dp))
                }
            }
        }
        // Øverst: «‹ Hjem» og den kompakte linja som kommer når headeren tones ut.
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(12.dp, 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.height(34.dp).clip(CircleShape).background(Color(0x591B1A17)).clickable { vm.weatherOpen = false }.padding(start = 10.dp, end = 14.dp), contentAlignment = Alignment.Center) {
                Text("‹ Hjem", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            }
            Spacer(Modifier.width(10.dp))
            if (w != null) Text("${w.place} · ${deg(w.current.temp)} | ${w.current.text}", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.alpha(fade))
        }
    }
    val d = vm.weatherSheetDay
    if (d != null && w != null) ConditionsSheet(w, d, { vm.weatherSheetDay = it }) { vm.weatherSheetDay = null }
}

@Composable
private fun WxHeader(w: WeatherFull, modifier: Modifier) {
    Column(modifier.fillMaxWidth().padding(vertical = 18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        WxLabel("Min posisjon")
        Text(w.place, color = Color.White, fontFamily = PaperFonts.serif, fontSize = 30.sp)
        Text(deg(w.current.temp), color = Color.White, fontFamily = PaperFonts.serif, fontSize = 96.sp, lineHeight = 100.sp)
        Text(w.current.text, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        Text("H:${deg(w.today.hi)}  L:${deg(w.today.lo)}  ·  Føles som ${deg(w.current.feels)}", color = dim, fontSize = 14.sp)
    }
}

/** De neste 24 timene. */
private fun next24(w: WeatherFull): List<WxHour> {
    val now = LocalDateTime.now().withMinute(0).withSecond(0).withNano(0)
    return w.hours.filter { h -> ldt(h.t)?.let { !it.isBefore(now) } ?: false }.take(24)
}

@Composable
private fun HourCard(w: WeatherFull, mode: String, setMode: (String) -> Unit, forhold: () -> Unit) {
    val hrs = next24(w)
    WxCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            WxLabel(when (mode) { "rain" -> "Nedbør neste 24 timer"; "wind" -> "Vind neste 24 timer"; else -> "Neste 24 timer" })
            Spacer(Modifier.weight(1f))
            Text("Forhold ›", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable(onClick = forhold))
        }
        Row(Modifier.fillMaxWidth().clip(CircleShape).background(Color.White.copy(alpha = .08f)).padding(3.dp)) {
            listOf("temp" to "Temperatur", "rain" to "Nedbør", "wind" to "Vind").forEach { (k, n) ->
                val on = mode == k
                Box(Modifier.weight(1f).height(30.dp).clip(CircleShape).background(if (on) Color.White.copy(alpha = .9f) else Color.Transparent).clickable { setMode(k) },
                    contentAlignment = Alignment.Center) { Text(n, color = if (on) Color(0xFF1B2A40) else Color.White, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold) }
            }
        }
        if (hrs.isEmpty()) Text("Ingen timevarsel.", color = dim, fontSize = 13.sp)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            hrs.forEachIndexed { i, h ->
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(if (i == 0) "Nå" else hhmm(h.t).take(2), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Text(wmoIcon(h.code, h.isDay), fontSize = 20.sp)
                    Text(h.precipProb?.takeIf { it >= 20 }?.let { "${it.roundToInt()} %" } ?: " ", color = Color(0xFFBFE6FF), fontSize = 10.5.sp)
                    Text(when (mode) {
                        "rain" -> h.precip?.let { String.format(nb, "%.1f", it) } ?: "0"
                        "wind" -> h.wind?.let { "${it.roundToInt()}" } ?: "–"
                        else -> deg(h.temp)
                    }, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        if (mode != "temp") Text(if (mode == "rain") "mm per time" else "m/s", color = dim, fontSize = 11.sp)
    }
}

private fun dayName(date: String, i: Int): String = if (i == 0) "I dag" else runCatching {
    LocalDate.parse(date.take(10)).format(DateTimeFormatter.ofPattern("EEE", nb)).replace(".", "").replaceFirstChar { it.uppercase() }
}.getOrDefault(date)

@Composable
private fun DaysCard(w: WeatherFull, open: (Int) -> Unit) {
    val days = w.days.take(7)
    val lo = days.mapNotNull { it.lo }.minOrNull() ?: 0.0
    val hi = days.mapNotNull { it.hi }.maxOrNull() ?: 10.0
    val span = (hi - lo).coerceAtLeast(1.0)
    WxCard {
        WxLabel("${days.size} dager")
        days.forEachIndexed { i, d ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(glassLine))
            Row(Modifier.fillMaxWidth().clickable { open(i) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(dayName(d.date, i), color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(52.dp))
                Column(Modifier.width(36.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(wmoIcon(d.code), fontSize = 18.sp)
                    d.precipProb?.takeIf { it >= 20 }?.let { Text("${it.roundToInt()} %", color = Color(0xFFBFE6FF), fontSize = 10.sp) }
                }
                Text(deg(d.lo), color = dim, fontSize = 14.sp, modifier = Modifier.width(34.dp), textAlign = TextAlign.End)
                val a = (((d.lo ?: lo) - lo) / span).toFloat()
                val b = (((d.hi ?: hi) - lo) / span).toFloat()
                val nowT = if (i == 0) w.current.temp?.let { ((it - lo) / span).toFloat().coerceIn(0f, 1f) } else null
                Canvas(Modifier.weight(1f).height(6.dp)) {
                    val r = size.height / 2
                    drawRoundRect(Color.White.copy(alpha = .18f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(r))
                    drawRoundRect(Brush.horizontalGradient(listOf(Color(0xFF8FD3F4), Color(0xFFFFD36B), Color(0xFFFF9F5A)), startX = 0f, endX = size.width),
                        topLeft = Offset(size.width * a, 0f), size = Size((size.width * (b - a)).coerceAtLeast(size.height), size.height), cornerRadius = androidx.compose.ui.geometry.CornerRadius(r))
                    nowT?.let { drawCircle(Color.White, radius = size.height * 0.9f, center = Offset(size.width * it, r)); drawCircle(Color(0xFF1B2A40), radius = size.height * 0.45f, center = Offset(size.width * it, r)) }
                }
                Text(deg(d.hi), color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(34.dp), textAlign = TextAlign.End)
            }
        }
    }
}

@Composable
private fun KvRow(a: String, b: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
        Text(a, color = dim, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Text(b, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun WindTile(w: WeatherFull) {
    val c = w.current
    WxCard {
        WxLabel("Vind")
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(Modifier.weight(1f)) {
                KvRow("Vind", c.wind?.let { String.format(nb, "%.1f m/s", it) } ?: "–")
                Box(Modifier.fillMaxWidth().height(1.dp).background(glassLine))
                KvRow("Vindkast", c.gust?.let { String.format(nb, "%.1f m/s", it) } ?: "–")
                Box(Modifier.fillMaxWidth().height(1.dp).background(glassLine))
                KvRow("Retning", c.windDir?.let { "${it.roundToInt()}° ${wxCompass(it)}" } ?: "–")
            }
            val tm = rememberTextMeasurer()
            Canvas(Modifier.size(112.dp)) {
                val r = size.minDimension / 2
                val ctr = Offset(size.width / 2, size.height / 2)
                drawCircle(Color.White.copy(alpha = .25f), r - 2, ctr, style = Stroke(2f))
                for (k in 0 until 36) {
                    val a = k * 10.0 * PI / 180
                    val len = if (k % 9 == 0) 12f else 6f
                    drawLine(Color.White.copy(alpha = if (k % 9 == 0) .8f else .35f), Offset(ctr.x + ((r - 4) * sin(a)).toFloat(), ctr.y - ((r - 4) * cos(a)).toFloat()),
                        Offset(ctr.x + ((r - 4 - len) * sin(a)).toFloat(), ctr.y - ((r - 4 - len) * cos(a)).toFloat()), 2f)
                }
                listOf("N" to 0.0, "Ø" to 90.0, "S" to 180.0, "V" to 270.0).forEach { (n, a0) ->
                    val a = a0 * PI / 180
                    val m = tm.measure(n, TextStyle(color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold))
                    drawText(m, topLeft = Offset(ctr.x + ((r - 26) * sin(a)).toFloat() - m.size.width / 2, ctr.y - ((r - 26) * cos(a)).toFloat() - m.size.height / 2))
                }
                c.windDir?.let { dirDeg ->
                    // Pila peker dit vinden blåser mot (fra retningen + 180°).
                    rotate(dirDeg.toFloat() + 180f, ctr) {
                        drawLine(Color.White, Offset(ctr.x, ctr.y + r * 0.55f), Offset(ctr.x, ctr.y - r * 0.55f), 4f, StrokeCap.Round)
                        val head = Path().apply { moveTo(ctr.x, ctr.y - r * 0.62f); lineTo(ctr.x - 9f, ctr.y - r * 0.40f); lineTo(ctr.x + 9f, ctr.y - r * 0.40f); close() }
                        drawPath(head, Color.White)
                    }
                }
                val v = tm.measure(c.wind?.let { String.format(nb, "%.0f", it) } ?: "–", TextStyle(color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold))
                drawCircle(Color(0x661B2A40), 22f, ctr)
                drawText(v, topLeft = Offset(ctr.x - v.size.width / 2, ctr.y - v.size.height / 2))
            }
        }
    }
}

@Composable
private fun MoonTile(m: WxMoon) {
    WxCard {
        WxLabel(m.name)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(Modifier.weight(1f)) {
                KvRow("Belyst", "${m.illum.roundToInt()} %")
                Box(Modifier.fillMaxWidth().height(1.dp).background(glassLine))
                KvRow("Neste fullmåne", shortDate(m.nextFull))
                Box(Modifier.fillMaxWidth().height(1.dp).background(glassLine))
                KvRow("Neste nymåne", shortDate(m.nextNew))
            }
            Canvas(Modifier.size(84.dp)) {
                val r = size.minDimension / 2 - 4
                val ctr = Offset(size.width / 2, size.height / 2)
                val disc = Path().apply { addOval(androidx.compose.ui.geometry.Rect(ctr.x - r, ctr.y - r, ctr.x + r, ctr.y + r)) }
                clipPath(disc) {
                    drawCircle(Color(0xFF2A3346), r, ctr)
                    // Lyset del: en lys skive som skyves inn fra høyre (voksende) eller venstre (minkende).
                    val ph = m.phase.coerceIn(0.0, 1.0)
                    val shift = if (ph <= 0.5) (1 - ph * 2) * 2 * r else -((ph - 0.5) * 2) * 2 * r
                    drawCircle(Color(0xFFF2EFE4), r, ctr)
                    drawCircle(Color(0xFF2A3346), r, Offset(ctr.x - shift.toFloat(), ctr.y))
                }
                drawCircle(Color.White.copy(alpha = .3f), r, ctr, style = Stroke(1.5f))
            }
        }
    }
}

private fun shortDate(iso: String?): String = runCatching { LocalDate.parse(iso!!.take(10)).format(DateTimeFormatter.ofPattern("EEE d. MMM", nb)).replace(".", "").replaceFirstChar { it.uppercase() } }.getOrDefault("–")

@Composable
private fun SunTile(w: WeatherFull, modifier: Modifier) {
    val now = LocalDateTime.now()
    val rise = w.today.sunrise?.let(::ldt)
    val set = w.today.sunset?.let(::ldt)
    val beforeSet = set != null && now.isBefore(set)
    val afterRise = rise != null && now.isAfter(rise)
    WxCard(modifier) {
        WxLabel(if (afterRise && beforeSet) "Solnedgang" else "Soloppgang")
        WxBig(if (afterRise && beforeSet) hhmm(w.today.sunset) else hhmm(w.days.getOrNull(1)?.sunrise?.takeIf { !beforeSet && afterRise } ?: w.today.sunrise))
        Canvas(Modifier.fillMaxWidth().height(46.dp)) {
            val mid = size.height * 0.62f
            val p = Path()
            for (x in 0..60) {
                val f = x / 60f
                val y = mid - sin((f - 0.25) * 2 * PI).toFloat() * size.height * 0.36f
                if (x == 0) p.moveTo(0f, y) else p.lineTo(size.width * f, y)
            }
            drawPath(p, Color.White.copy(alpha = .6f), style = Stroke(2.5f))
            drawLine(Color.White.copy(alpha = .35f), Offset(0f, mid), Offset(size.width, mid), 1.5f)
            val f = (now.hour * 60 + now.minute) / 1440f
            val y = mid - sin((f - 0.25) * 2 * PI).toFloat() * size.height * 0.36f
            drawCircle(Color(0xFFFFD36B), 7f, Offset(size.width * f, y))
        }
        Text("Soloppgang ${hhmm(w.today.sunrise)} · ned ${hhmm(w.today.sunset)}", color = dim, fontSize = 12.sp)
        w.today.daylight?.let { Text("Dagslys $it", color = dim, fontSize = 12.sp) }
    }
}

private fun uvName(v: Double) = when { v < 3 -> "Lav"; v < 6 -> "Moderat"; v < 8 -> "Høy"; v < 11 -> "Svært høy"; else -> "Ekstrem" }

@Composable
private fun UvTile(w: WeatherFull, modifier: Modifier) {
    val v = w.current.uv ?: w.days.firstOrNull()?.uvMax ?: 0.0
    WxCard(modifier) {
        WxLabel("UV-indeks")
        WxBig("${v.roundToInt()}")
        Text(uvName(v), color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Canvas(Modifier.fillMaxWidth().height(6.dp)) {
            drawRoundRect(Brush.horizontalGradient(listOf(Color(0xFF5BD08A), Color(0xFFFFD36B), Color(0xFFFF9F5A), Color(0xFFE5484D), Color(0xFFB45CE0))),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(size.height / 2))
            drawCircle(Color.White, size.height, Offset(size.width * (v / 11.0).toFloat().coerceIn(0f, 1f), size.height / 2))
        }
        Text(if (v < 3) "Ingen solbeskyttelse trengs." else "Bruk solkrem midt på dagen.", color = dim, fontSize = 12.sp)
    }
}

@Composable
private fun FeelsTile(w: WeatherFull, modifier: Modifier) {
    val t = w.current.temp
    val f = w.current.feels
    WxCard(modifier) {
        WxLabel("Føles som")
        WxBig(deg(f))
        Text(when {
            t == null || f == null -> ""
            f < t - 1 -> "Vinden gjør at det føles kaldere."
            f > t + 1 -> "Fuktigheten gjør at det føles varmere."
            else -> "Omtrent som den faktiske temperaturen."
        }, color = dim, fontSize = 12.sp)
    }
}

@Composable
private fun YesterdayTile(w: WeatherFull, modifier: Modifier) {
    val a = w.today.hi
    val b = w.yHi
    val diff = if (a != null && b != null) (a - b).roundToInt() else null
    WxCard(modifier) {
        WxLabel("Mot i går")
        WxBig(when { diff == null -> "–"; diff == 0 -> "Likt"; diff > 0 -> "+$diff°"; else -> "−${abs(diff)}°" })
        Text(when { diff == null -> ""; diff > 0 -> "Varmere enn i går"; diff < 0 -> "Kaldere enn i går"; else -> "Som i går" }, color = Color.White, fontSize = 13.sp)
        Text("I dag H:${deg(a)} · I går H:${deg(b)}", color = dim, fontSize = 12.sp)
    }
}

@Composable
private fun RainTile(w: WeatherFull, modifier: Modifier) {
    WxCard(modifier) {
        WxLabel("Nedbør")
        WxBig("${String.format(nb, "%.1f", w.today.precipSum ?: 0.0)} mm")
        Text("I dag", color = Color.White, fontSize = 13.sp)
        val next = w.nextRainT?.let(::ldt)
        Text(if (next != null) "Neste ventet ${next.format(DateTimeFormatter.ofPattern("EEE HH:mm", nb)).replace(".", "")}${w.nextRainMm?.let { String.format(nb, " (%.1f mm)", it) } ?: ""}"
            else "Ingen nedbør ventet de neste dagene.", color = dim, fontSize = 12.sp)
    }
}

@Composable
private fun VisTile(w: WeatherFull, modifier: Modifier) {
    val km = w.current.visibility?.let { it / 1000.0 }
    WxCard(modifier) {
        WxLabel("Sikt")
        WxBig(km?.let { if (it >= 10) "${it.roundToInt()} km" else String.format(nb, "%.1f km", it) } ?: "–")
        Text(when { km == null -> ""; km >= 20 -> "Helt klar sikt."; km >= 8 -> "God sikt."; km >= 2 -> "Noe dis."; else -> "Dårlig sikt, mulig tåke." }, color = dim, fontSize = 12.sp)
    }
}

@Composable
private fun HumTile(w: WeatherFull, modifier: Modifier) {
    WxCard(modifier) {
        WxLabel("Luftfuktighet")
        WxBig(w.current.humidity?.let { "${it.roundToInt()} %" } ?: "–")
        Text("Duggpunktet er ${deg(w.current.dew)} akkurat nå.", color = dim, fontSize = 12.sp)
    }
}

@Composable
private fun PressTile(w: WeatherFull, modifier: Modifier) {
    val v = w.current.pressure
    WxCard(modifier) {
        WxLabel("Lufttrykk")
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(when (w.current.pressureTrend) { "up" -> "↑"; "down" -> "↓"; else -> "→" }, color = Color.White, fontSize = 22.sp)
            WxBig(v?.let { "${it.roundToInt()}" } ?: "–", 28)
            Text("hPa", color = dim, fontSize = 12.sp)
        }
        Canvas(Modifier.fillMaxWidth().height(6.dp)) {
            drawRoundRect(Color.White.copy(alpha = .22f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(size.height / 2))
            v?.let { drawCircle(Color.White, size.height, Offset(size.width * ((it - 970) / 80.0).toFloat().coerceIn(0f, 1f), size.height / 2)) }
        }
        Row { Text("Lavt", color = dim, fontSize = 11.sp, modifier = Modifier.weight(1f)); Text("Høyt", color = dim, fontSize = 11.sp) }
    }
}

/* ---------------- «Forhold»-arket ---------------- */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConditionsSheet(w: WeatherFull, day: Int, setDay: (Int) -> Unit, close: () -> Unit) {
    val days = w.days.take(7)
    val d = days.getOrNull(day) ?: return
    var feels by remember { mutableStateOf(false) }
    val hrs = w.hours.filter { it.t.startsWith(d.date.take(10)) }
    ModalBottomSheet(onDismissRequest = close, containerColor = Color(0xFF16233A), contentColor = Color.White) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp, 0.dp, 16.dp, 34.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Forhold", color = Color.White, fontFamily = PaperFonts.serif, fontSize = 24.sp, modifier = Modifier.weight(1f))
                Text("×", color = Color.White, fontSize = 22.sp, modifier = Modifier.clickable(onClick = close).padding(6.dp))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                days.forEachIndexed { i, x ->
                    val on = i == day
                    val ld = runCatching { LocalDate.parse(x.date.take(10)) }.getOrNull()
                    Column(Modifier.clip(RoundedCornerShape(12.dp)).clickable { setDay(i) }.padding(4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(ld?.format(DateTimeFormatter.ofPattern("EEEEE", nb))?.uppercase(nb) ?: "", color = dim, fontSize = 11.sp)
                        Box(Modifier.size(32.dp).clip(CircleShape).background(if (on) Color.White else Color.Transparent), contentAlignment = Alignment.Center) {
                            Text("${ld?.dayOfMonth ?: ""}", color = if (on) Color(0xFF16233A) else Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        }
                    }
                }
            }
            Text(runCatching { LocalDate.parse(d.date.take(10)).format(DateTimeFormatter.ofPattern("EEEE d. MMMM", nb)).replaceFirstChar { it.uppercase() } }.getOrDefault(d.date),
                color = dim, fontSize = 13.sp)
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(if (day == 0) deg(w.current.temp) else deg(d.hi), color = Color.White, fontFamily = PaperFonts.serif, fontSize = 40.sp)
                Column(Modifier.padding(bottom = 6.dp)) {
                    Text("H:${deg(d.hi)} L:${deg(d.lo)}", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    Text(wmoText(d.code), color = dim, fontSize = 13.sp)
                }
            }
            if (hrs.size < 4) Text("Timevarselet finnes for de nærmeste dagene. Velg i dag eller i morgen for graf.", color = dim, fontSize = 13.sp)
            else {
                TempChart(hrs, feels, day == 0)
                Row(Modifier.clip(CircleShape).background(Color.White.copy(alpha = .1f)).padding(3.dp)) {
                    listOf(false to "Faktisk", true to "Føles som").forEach { (k, n) ->
                        Box(Modifier.height(30.dp).clip(CircleShape).background(if (feels == k) Color.White else Color.Transparent).clickable { feels = k }.padding(horizontal = 16.dp),
                            contentAlignment = Alignment.Center) { Text(n, color = if (feels == k) Color(0xFF16233A) else Color.White, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold) }
                    }
                }
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("Sjanse for nedbør", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text("Dagens sjanse: ${(d.precipProb ?: hrs.mapNotNull { it.precipProb }.maxOrNull() ?: 0.0).roundToInt()} %", color = dim, fontSize = 12.sp)
                }
                RainChart(hrs)
            }
        }
    }
}

/** Temperaturgraf over døgnet: prikket for passerte timer, H/L-markører og ikoner hver 2. time. */
@Composable
private fun TempChart(hrs: List<WxHour>, feels: Boolean, today: Boolean) {
    val tm = rememberTextMeasurer()
    val vals = hrs.map { (if (feels) it.feels else it.temp) ?: 0.0 }
    val nowH = LocalDateTime.now().hour
    Canvas(Modifier.fillMaxWidth().height(190.dp)) {
        val top = 34f
        val bottom = size.height - 24f
        val lo = vals.minOrNull() ?: 0.0
        val hi = vals.maxOrNull() ?: 1.0
        val span = (hi - lo).coerceAtLeast(1.0)
        val step = size.width / (vals.size - 1).coerceAtLeast(1)
        fun y(v: Double) = (bottom - (v - lo) / span * (bottom - top)).toFloat()
        for (g in 0..3) {
            val gy = top + (bottom - top) * g / 3f
            drawLine(Color.White.copy(alpha = .1f), Offset(0f, gy), Offset(size.width, gy), 1f)
        }
        val past = Path(); val future = Path()
        vals.forEachIndexed { i, v ->
            val x = i * step
            val h = ldt(hrs[i].t)?.hour ?: i
            val isPast = today && h < nowH
            if (isPast || (today && h == nowH)) { if (past.isEmpty) past.moveTo(x, y(v)) else past.lineTo(x, y(v)) }
            if (!isPast) { if (future.isEmpty) future.moveTo(x, y(v)) else future.lineTo(x, y(v)) }
        }
        drawPath(past, Color.White.copy(alpha = .6f), style = Stroke(3f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 7f))))
        drawPath(future, Color(0xFFFFD36B), style = Stroke(4f, cap = StrokeCap.Round))
        val iHi = vals.indexOf(hi); val iLo = vals.indexOf(lo)
        listOf(iHi to "H", iLo to "L").forEach { (i, n) ->
            if (i >= 0) {
                drawCircle(Color.White, 6f, Offset(i * step, y(vals[i])))
                val m = tm.measure("$n ${vals[i].roundToInt()}°", TextStyle(color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold))
                drawText(m, topLeft = Offset((i * step - m.size.width / 2).coerceIn(0f, size.width - m.size.width), (y(vals[i]) - m.size.height - 6).coerceAtLeast(0f)))
            }
        }
        hrs.forEachIndexed { i, h ->
            if (i % 2 == 0) {
                val m = tm.measure(wmoIcon(h.code, h.isDay), TextStyle(fontSize = 11.sp))
                drawText(m, topLeft = Offset(i * step - m.size.width / 2, 0f))
            }
            if (i % 6 == 0) {
                val m = tm.measure(String.format(nb, "%02d", ldt(h.t)?.hour ?: i), TextStyle(color = Color.White.copy(alpha = .6f), fontSize = 10.sp))
                drawText(m, topLeft = Offset((i * step - m.size.width / 2).coerceAtLeast(0f), size.height - m.size.height))
            }
        }
    }
}

@Composable
private fun RainChart(hrs: List<WxHour>) {
    val tm = rememberTextMeasurer()
    Canvas(Modifier.fillMaxWidth().height(110.dp)) {
        val bottom = size.height - 18f
        val bw = size.width / hrs.size
        hrs.forEachIndexed { i, h ->
            val pp = ((h.precipProb ?: 0.0) / 100.0).toFloat().coerceIn(0f, 1f)
            val hgt = (bottom - 6f) * pp
            drawRoundRect(Color(0xFF8FD3F4).copy(alpha = .35f + pp * .6f), topLeft = Offset(i * bw + bw * 0.15f, bottom - hgt),
                size = Size(bw * 0.7f, hgt.coerceAtLeast(2f)), cornerRadius = androidx.compose.ui.geometry.CornerRadius(3f))
            if (i % 6 == 0) {
                val m = tm.measure(String.format(nb, "%02d", ldt(h.t)?.hour ?: i), TextStyle(color = Color.White.copy(alpha = .6f), fontSize = 10.sp))
                drawText(m, topLeft = Offset(i * bw, size.height - m.size.height))
            }
        }
        drawLine(Color.White.copy(alpha = .2f), Offset(0f, bottom), Offset(size.width, bottom), 1f)
    }
}

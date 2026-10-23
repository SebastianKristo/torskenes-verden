package no.kristo.finanshub.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.LocalDateTime
import kotlin.math.roundToInt

/*
 * Prompt 32 (ANDROID32): Vær → «Forhold» med egne visninger for nedbør og vind (claude-code-vaer-forhold-moduser.md, Vaer.dc.html isT/isR/isW).
 * Bryteren ☁ / 💧 / 🌬 bytter både timeraden og dagslisten. Tittel (20 dp) og undertittel (17 dp, én linje) har fast høyde, og timecellene
 * er alltid 142 dp, så kortet står likt når man bytter. Valget huskes i økten (vm.p32b.wxMode). ✕ oppe til høyre (claude-code-vaer-lukk-x.md).
 */

private val glass32b = Color.White.copy(alpha = .16f)
private val shape32b = RoundedCornerShape(24.dp)
private fun Modifier.glass32b(): Modifier = this.clip(shape32b).background(glass32b).border(1.dp, glass32b, shape32b)

private val RAIN32B = Color(0xFF5AD1FF)
private val WIND32B = Color(0xFF3FD0E0)
private const val DROP32B = "M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z"
private const val WINDP32B = "M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"

/** ✕ Lukk: rund 42 dp glass (hvit 22 %), kryss 17 dp. */
@Composable
internal fun WxClose32b(onClick: () -> Unit) {
    Box(
        Modifier.size(42.dp).clip(CircleShape).background(Color.White.copy(alpha = .22f))
            .clickable(role = Role.Button, onClickLabel = "Lukk Vær") { Haptics.dismiss(); onClick() }.semantics { contentDescription = "Lukk" },
        contentAlignment = Alignment.Center,
    ) { WxIcon("M6 6l12 12M18 6L6 18", Color.White, 17.dp, stroke = 2.6f) }
}

private fun mm32b(v: Double?): String = when {
    v == null || v < 0.05 -> ""
    v < 10 -> wxF1(v)
    else -> "${v.roundToInt()}"
}

/** Timeraden og «Forhold ›» med bryteren. */
@Composable
internal fun HourCard32b(vm: AppViewModel, w: WeatherFull, forhold: () -> Unit) {
    val mode = vm.p32b.wxMode
    val hrs = wxNext24(w)
    val pent = vm.wxCmp22?.pentHours ?: emptyMap()
    val gMax = maxOf(1.0, hrs.maxOfOrNull { maxOf(it.gust ?: 0.0, it.wind ?: 0.0) } ?: 1.0)
    Column(Modifier.fillMaxWidth().glass32b().padding(top = 14.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = forhold)) {
                Box(Modifier.height(20.dp), contentAlignment = Alignment.CenterStart) { Text("Forhold ›", fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1) }
                Box(Modifier.height(17.dp), contentAlignment = Alignment.CenterStart) {
                    Text(when (mode) { "rain" -> "Nedbør (mm) · Sjanse"; "wind" -> "Vind (m/s) · Kast"; else -> "Temperatur (°C)" }, fontSize = 12.5.sp, color = wxPp,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            // Prompt 46 (claude-code-vaer-modusvelger-liquid-glass.md): glassdråpe som glir og kan dras (ui/Ui46.kt).
            LiquidSeg46(listOf("temp" to WX_IC.getValue("part"), "rain" to DROP32B, "wind" to WINDP32B), listOf("Temperatur", "Nedbør", "Vind"), mode) { vm.p32b.wxMode = it }
        }
        if (hrs.isEmpty()) Text("Ingen timevarsel.", fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp).alpha(.75f))
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp)) {
            hrs.forEachIndexed { k, h ->
                val hh = wxLdt(h.t)?.hour ?: 0
                val pp = h.precipProb?.roundToInt() ?: 0
                Column(Modifier.width(56.dp).height(142.dp).padding(vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(if (k == 0) "Nå" else wxPad(hh), fontSize = 14.sp, fontWeight = if (k == 0) FontWeight.ExtraBold else FontWeight.Bold)
                    when (mode) {
                        "rain" -> {
                            val f = ((h.precip ?: 0.0) / 3.0).toFloat().coerceIn(0f, 1f)
                            Canvas(Modifier.size(30.dp, 62.dp).clip(RoundedCornerShape(9.dp))) {
                                drawRect(Color.Black.copy(alpha = .16f))
                                val dash = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))
                                listOf(1f / 3f, 2f / 3f).forEach { y -> drawLine(Color.White.copy(alpha = .28f), Offset(0f, size.height * y), Offset(size.width, size.height * y), 1.dp.toPx(), pathEffect = dash) }
                                if (f > 0f) drawRoundRect(RAIN32B, Offset(0f, size.height * (1 - f)), Size(size.width, size.height * f), CornerRadius(if (f > .9f) 9.dp.toPx() else 3.dp.toPx()))
                            }
                            Text(mm32b(h.precip), fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.heightIn(min = 16.dp), lineHeight = 16.sp)
                            Text("$pp %", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = wxPp, lineHeight = 15.sp)
                        }
                        "wind" -> {
                            Text("${(h.wind ?: 0.0).roundToInt()}", fontSize = 20.sp, fontWeight = FontWeight.Bold, lineHeight = 22.sp, modifier = Modifier.padding(top = 4.dp))
                            Text("m/s", fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = wxPp, lineHeight = 12.sp, modifier = Modifier.offset(y = (-6).dp))
                            Text("kast ${(h.gust ?: h.wind ?: 0.0).roundToInt()}", fontSize = 11.sp, fontWeight = FontWeight.Bold, lineHeight = 13.sp, modifier = Modifier.alpha(.7f).offset(y = (-6).dp))
                            // Sammenhengende linje over timene: hver celle tegner sin bit fra midt mellom naboene.
                            val prev = hrs.getOrNull(k - 1) ?: h
                            val next = hrs.getOrNull(k + 1) ?: h
                            Canvas(Modifier.size(56.dp, 34.dp).offset(y = (-6).dp)) {
                                fun y(v: Double?) = size.height - (((v ?: 0.0) / gMax).toFloat().coerceIn(0f, 1f) * (size.height - 4.dp.toPx())) - 2.dp.toPx()
                                fun mid(a: Double?, b: Double?) = ((a ?: 0.0) + (b ?: 0.0)) / 2
                                val ga = Path().apply {
                                    moveTo(0f, size.height)
                                    lineTo(0f, y(mid(prev.gust ?: prev.wind, h.gust ?: h.wind)))
                                    lineTo(size.width / 2, y(h.gust ?: h.wind))
                                    lineTo(size.width, y(mid(h.gust ?: h.wind, next.gust ?: next.wind)))
                                    lineTo(size.width, size.height); close()
                                }
                                drawPath(ga, RAIN32B.copy(alpha = .28f))
                                val sl = Path().apply {
                                    moveTo(0f, y(mid(prev.wind, h.wind))); lineTo(size.width / 2, y(h.wind)); lineTo(size.width, y(mid(h.wind, next.wind)))
                                }
                                drawPath(sl, WIND32B, style = Stroke(3.dp.toPx(), cap = StrokeCap.Butt))
                            }
                        }
                        else -> {
                            WxCodeIcon(wxKey(h.code, !h.isDay), 28.dp)
                            Text(if (pp >= 20) "$pp %" else "", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = wxPp, modifier = Modifier.heightIn(min = 13.dp), lineHeight = 13.sp)
                            Text(wxR(h.temp), fontSize = 17.sp, fontWeight = FontWeight.Bold)
                            val pt = pent[h.t.take(13)]
                            Text(pt?.let { "${it.roundToInt()}°" } ?: "", fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFFFFB27A), modifier = Modifier.heightIn(min = 15.dp), lineHeight = 15.sp)
                        }
                    }
                }
            }
        }
    }
}

/** Timene for en dag (0–23), fra timevarselet. */
private fun dayHours32b(w: WeatherFull, d: LocalDate): List<Pair<Int, WxHour>> =
    w.hours.mapNotNull { h -> wxLdt(h.t)?.takeIf { it.toLocalDate() == d }?.let { it.hour to h } }

/** Dagslisten: ☁ som før (lav–høy), 💧 12 søyler + mm + sjanse, 🌬 minigraf + min–maks kast. */
@Composable
internal fun DaysCard32b(vm: AppViewModel, w: WeatherFull, temp: @Composable () -> Unit, open: (Int) -> Unit) {
    val mode = vm.p32b.wxMode
    if (mode != "rain" && mode != "wind") { temp(); return }
    val days = w.days.take(7)
    if (days.isEmpty()) return
    val now = LocalDateTime.now()
    Column(Modifier.fillMaxWidth().glass32b().padding(horizontal = 16.dp, vertical = 4.dp)) {
        days.forEachIndexed { k, d ->
            if (k > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = .18f)))
            val date = wxLd(d.date)
            val hs = if (date != null) dayHours32b(w, date) else emptyList()
            Row(Modifier.fillMaxWidth().clickable { open(k) }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(if (k == 0) "I dag" else date?.let(::wxWd) ?: "", fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(52.dp), maxLines = 1)
                if (mode == "rain") {
                    val bars = (0 until 12).map { b -> hs.filter { it.first / 2 == b }.sumOf { it.second.precip ?: 0.0 } }
                    val nowBar = if (k == 0) now.hour / 2 else -1
                    Row(Modifier.weight(1f).height(26.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                        bars.forEachIndexed { b, v ->
                            val f = (v / 4.0).toFloat().coerceIn(0f, 1f)
                            val day = b in 3..8
                            Canvas(Modifier.weight(1f).fillMaxHeight().then(if (b == nowBar) Modifier.border(1.dp, Color.White, RoundedCornerShape(5.dp)) else Modifier).padding(if (b == nowBar) 1.dp else 0.dp)) {
                                drawRoundRect(Color.White.copy(alpha = if (day) .16f else .08f), cornerRadius = CornerRadius(4.dp.toPx()))
                                if (f > 0f) drawRoundRect(RAIN32B, Offset(0f, size.height * (1 - f)), Size(size.width, size.height * f), CornerRadius(4.dp.toPx()))
                            }
                        }
                    }
                    val tot = if (hs.isNotEmpty()) hs.sumOf { it.second.precip ?: 0.0 } else d.precipSum ?: 0.0
                    Text(if (tot < 0.05) "0 mm" else wxF1(tot) + " mm", fontSize = 16.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.End,
                        color = if (tot < 0.05) Color.White.copy(alpha = .5f) else Color.White, modifier = Modifier.width(62.dp), maxLines = 1)
                    val pp = d.precipProb?.roundToInt() ?: hs.maxOfOrNull { it.second.precipProb ?: 0.0 }?.roundToInt() ?: 0
                    Row(Modifier.width(58.dp), horizontalArrangement = Arrangement.spacedBy(3.dp, Alignment.End), verticalAlignment = Alignment.CenterVertically) {
                        if (pp >= 30) WxIcon(DROP32B, RAIN32B, 13.dp, fill = true)
                        Text("$pp %", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = if (pp >= 30) wxPp else Color.White.copy(alpha = .5f), maxLines = 1)
                    }
                } else {
                    val sp = (0 until 24).map { h -> hs.firstOrNull { it.first == h }?.second?.wind }
                    val gs = (0 until 24).map { h -> hs.firstOrNull { it.first == h }?.second?.let { it.gust ?: it.wind } }
                    val mx = maxOf(1.0, gs.filterNotNull().maxOrNull() ?: 1.0)
                    val today = k == 0
                    val nowF = (now.hour + now.minute / 60f) / 24f
                    BoxWithConstraints(Modifier.weight(1f).height(28.dp)) {
                        val wdt = maxWidth
                        Canvas(Modifier.fillMaxSize().clip(RoundedCornerShape(5.dp))) {
                            drawRect(Color.Black.copy(alpha = .12f))
                            drawRect(Color.White.copy(alpha = .08f), Offset(size.width * .25f, 0f), Size(size.width * .5f, size.height))
                            fun x(i: Int) = size.width * (i + .5f) / 24f
                            fun y(v: Double) = size.height - ((v / mx).toFloat().coerceIn(0f, 1f) * (size.height - 4.dp.toPx())) - 2.dp.toPx()
                            val idx = (0 until 24).filter { gs[it] != null }
                            if (idx.size >= 2) {
                                val ga = Path().apply {
                                    moveTo(x(idx.first()), size.height)
                                    idx.forEach { lineTo(x(it), y(gs[it]!!)) }
                                    lineTo(x(idx.last()), size.height); close()
                                }
                                drawPath(ga, RAIN32B.copy(alpha = .3f))
                            }
                            val si = (0 until 24).filter { sp[it] != null }
                            if (si.size >= 2) {
                                val sl = Path().apply { si.forEachIndexed { j, i -> if (j == 0) moveTo(x(i), y(sp[i]!!)) else lineTo(x(i), y(sp[i]!!)) } }
                                drawPath(sl, WIND32B, style = Stroke(2.4.dp.toPx(), cap = StrokeCap.Round, pathEffect = if (today) PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx())) else null))
                            }
                        }
                        // Hvit prikk på nå (eget element, så den ikke strekkes).
                        if (today) {
                            val hi = now.hour.coerceIn(0, 23)
                            val v = sp[hi] ?: sp.filterNotNull().firstOrNull()
                            if (v != null) {
                                val yy = 28.dp - ((v / mx).toFloat().coerceIn(0f, 1f) * 24f).dp - 2.dp
                                Box(Modifier.offset(x = wdt * nowF - 4.dp, y = yy - 4.dp).size(8.dp).clip(CircleShape).background(Color.White))
                            }
                        }
                    }
                    val gl = gs.filterNotNull()
                    val lo = gl.minOrNull() ?: d.windMax
                    val hi2 = gl.maxOrNull() ?: d.windMax
                    Text(if (lo == null || hi2 == null) "–" else "${lo.roundToInt()}–${hi2.roundToInt()} m/s", fontSize = 15.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.End,
                        modifier = Modifier.width(88.dp), maxLines = 1)
                }
            }
        }
    }
}

package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.Screen
import no.kristo.finanshub.noUrl31
import no.kristo.finanshub.openKal26
import org.json.JSONObject
import java.time.LocalDate

/*
 * Prompt 31 (ANDROID31): kortene under verktøysvar i Chat (chToolRun() + chCardVals() i Mobil Papir App.dc.html).
 * Kortet ligger i meldingen (card: {k, …}) så det vises igjen i historikken. Trykk åpner modulen.
 *  - Vær: ett kort (radius 22, overflow skjult), gradienten bak hele kortet også timeraden, skillelinje rgba(255,255,255,.22).
 *  - Kalender: lite kalenderikon (rød stripe med ukedag), «I dag» · «19. oktober · 2 hendelser» · ›, og liste med farget strek.
 *  - Avganger, pakker, finans og huskeliste i samme mønster (huskelisten kan krysses av direkte i kortet).
 * Feltnavnene leses romslig (serverens navn og fasitens korte navn).
 */

private fun JSONObject.c31(vararg k: String): String? {
    for (x in k) if (has(x) && !isNull(x)) optString(x).takeIf { it.isNotBlank() && it != "null" }?.let { return it }
    return null
}
private fun JSONObject.arr31(vararg k: String): List<JSONObject> {
    for (x in k) optJSONArray(x)?.let { a -> return (0 until a.length()).mapNotNull { a.optJSONObject(it) } }
    return emptyList()
}
private fun hex31(s: String?, def: Long): Color = s?.removePrefix("#")?.takeIf { it.length == 6 }?.toLongOrNull(16)?.let { Color(0xFF000000 or it) } ?: Color(def)
private fun deg31(v: String?): String = v?.let { if (it.endsWith("°")) it else "$it°" } ?: "–"

/** Kortet i en melding (JSON fra serveren). */
@Composable
internal fun ChatCard31(vm: AppViewModel, raw: String, v: ChatV27) {
    val o = remember(raw) { runCatching { JSONObject(raw) }.getOrNull() } ?: return
    when (o.c31("k", "kind", "type")) {
        "weather", "wx" -> WeatherCard31(o) { vm.openWeather() }
        "calendar", "cal" -> CalendarCard31(vm, o, v)
        "departures", "dep" -> ListCard31(v, o, "Avganger") { vm.openRuter() }
        "packages", "pk" -> ListCard31(v, o, "Pakker") { vm.go(Screen.Tracking) }
        "finance", "fin" -> FinanceCard31(v, o) { vm.go(Screen.Home) }
        "tasks" -> TasksCard31(vm, v, o)
        else -> {}
    }
}

/* ---------- Vær ---------- */

@Composable
private fun WeatherCard31(o: JSONObject, onClick: () -> Unit) {
    val d = o.c31("d", "desc", "description", "text") ?: ""
    val night = o.optBoolean("night", false)
    val bg = when {
        night -> Brush.verticalGradient(listOf(Color(0xFF0E1A33), Color(0xFF2B3A5C)))
        Regex("regn|byger|overskyet|tåke|sludd|snø", RegexOption.IGNORE_CASE).containsMatchIn(d) -> Brush.verticalGradient(listOf(Color(0xFF46525F), Color(0xFF6F7B8A)))
        else -> Brush.verticalGradient(0f to Color(0xFF134A86), .7f to Color(0xFF3F74AB), 1f to Color(0xFF5F8FC0))
    }
    val hours = o.arr31("h", "hours", "hourly")
    val hi = o.c31("hi", "max", "high")
    val lo = o.c31("lo", "min", "low")
    Column(
        Modifier.widthIn(max = 420.dp).fillMaxWidth()
            .shadow(16.dp, RoundedCornerShape(22.dp), ambientColor = Color(0xFF14325A).copy(alpha = .55f), spotColor = Color(0xFF14325A).copy(alpha = .55f))
            .clip(RoundedCornerShape(22.dp)).background(bg).clickable(role = Role.Button, onClickLabel = "Åpne Vær") { Haptics.select(); onClick() },
    ) {
        Row(Modifier.fillMaxWidth().padding(start = 18.dp, top = 16.dp, end = 18.dp, bottom = 14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(o.c31("city", "place", "name") ?: "Her", color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    WxIcon("M21 3L3 10.5l7.5 2.5L13 21z", Color.White, 13.dp, fill = true)
                }
                Text(deg31(o.c31("t", "temp", "temperature")), color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Light, fontSize = 44.sp, lineHeight = 46.sp, maxLines = 1)
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                WxGlyph31(o.c31("ic", "icon", "symbol"), 24)
                if (d.isNotBlank()) Text(d.replaceFirstChar { it.uppercase() }, color = Color.White.copy(alpha = .85f), fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1)
                if (hi != null || lo != null) Text("H:${hi ?: "–"}° L:${lo ?: "–"}°".replace("°°", "°"), color = Color.White.copy(alpha = .85f), fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp)
            }
        }
        if (hours.isNotEmpty()) Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp)) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = .22f)))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 10.dp, bottom = 14.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                hours.take(8).forEach { h ->
                    Column(Modifier.widthIn(min = 44.dp).weight(1f, fill = false), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(h.c31("h", "hour", "time")?.let { if (it.length > 5 && it.contains('T')) it.substring(11, 13) else it } ?: "", color = Color.White.copy(alpha = .85f),
                            fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1)
                        WxGlyph31(h.c31("ic", "icon", "symbol"), 17)
                        Text(deg31(h.c31("t", "temp")), color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
                    }
                }
            }
        }
    }
}

/** Værsymbol: emoji fra fasiten eller serverens symbolnøkkel (samme ikoner som Vær). */
@Composable
private fun WxGlyph31(ic: String?, size: Int) {
    val v = ic ?: return
    if (v.any { it.code > 0x2000 }) Text(v, fontSize = size.sp, lineHeight = (size + 2).sp)
    else WxCodeIcon(v.substringBefore('_').let { k -> when {
        k.contains("clearsky") || k == "sun" -> "sun"; k == "moon" -> "moon"; k.contains("fair") || k.startsWith("part") -> "part"; k.contains("rain") || k.contains("shower") -> "rain"
        k.contains("snow") || k.contains("sleet") -> "snow"; k.contains("thunder") || k == "storm" -> "storm"; k.contains("fog") -> "fog"; else -> "cloud" } }, size.dp)
}

/* ---------- Kalender ---------- */

@Composable
private fun CalendarCard31(vm: AppViewModel, o: JSONObject, v: ChatV27) {
    val items = o.arr31("items", "events")
    val date = o.c31("date")?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
    val open = { Haptics.select(); vm.openKal26(); if (date != null) vm.kal26.cur = date }
    Column(
        Modifier.widthIn(max = 420.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(v.card).border(1.dp, v.line, RoundedCornerShape(22.dp))
            .clickable(role = Role.Button, onClickLabel = "Åpne Kalender") { open() }.padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.size(40.dp, 42.dp).clip(RoundedCornerShape(10.dp)).background(Color.White).border(1.dp, v.line, RoundedCornerShape(10.dp))) {
                Box(Modifier.fillMaxWidth().height(13.dp).background(Color(0xFFB23A2A)), contentAlignment = Alignment.Center) {
                    Text(o.c31("wd") ?: date?.let { listOf("MAN", "TIR", "ONS", "TOR", "FRE", "LØR", "SØN")[it.dayOfWeek.value - 1] } ?: "", color = Color.White,
                        fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 8.5.sp, lineHeight = 9.sp)
                }
                Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                    Text(o.c31("n", "day") ?: date?.dayOfMonth?.toString() ?: "", color = Color(0xFF1B1A17), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 17.sp, lineHeight = 18.sp)
                }
            }
            Column(Modifier.weight(1f)) {
                Text(o.c31("t", "title", "label") ?: "I dag", color = v.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1)
                Text(o.c31("sub") ?: "${items.size} hendelser", color = v.mut, fontFamily = PaperFonts.sans, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text("›", color = v.mut, fontSize = 18.sp)
        }
        if (items.isEmpty()) Text("Ingenting i kalenderen.", color = v.mut, fontFamily = PaperFonts.sans, fontSize = 13.5.sp)
        items.take(8).forEachIndexed { i, x ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(v.line))
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.width(3.dp).fillMaxHeight().heightIn(min = 18.dp).clip(RoundedCornerShape(2.dp)).background(hex31(x.c31("c", "color"), 0xFF7A5AD6)))
                val tm = x.c31("tm", "time", "start") ?: if (x.optBoolean("allDay", false)) "Hele" else ""
                Text(tm.ifBlank { "Hele" }, color = v.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, modifier = Modifier.width(44.dp), maxLines = 1)
                Text(noUrl31(x.c31("t", "title") ?: ""), color = v.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            }
        }
    }
}

/* ---------- Avganger og pakker ---------- */

@Composable
private fun ListCard31(v: ChatV27, o: JSONObject, title: String, onClick: () -> Unit) {
    val items = o.arr31("items", "departures", "packages", "list")
    Column(
        Modifier.widthIn(max = 420.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(v.card).border(1.dp, v.line, RoundedCornerShape(22.dp))
            .clickable(role = Role.Button, onClickLabel = "Åpne $title") { Haptics.select(); onClick() }.padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(o.c31("title", "stop", "t") ?: title, color = v.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text("›", color = v.mut, fontSize = 18.sp)
        }
        if (items.isEmpty()) Text(if (title == "Pakker") "Ingen aktive pakker." else "Ingen avganger nå.", color = v.mut, fontFamily = PaperFonts.sans, fontSize = 13.5.sp)
        items.take(6).forEachIndexed { i, x ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(v.line))
            if (title == "Pakker") PackageRow31(v, x) else DepRow31(v, x)
        }
    }
}

@Composable
private fun DepRow31(v: ChatV27, x: JSONObject) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        val c = hex31(x.c31("color", "c"), 0xFFB23A2A)
        Box(Modifier.heightIn(min = 24.dp).widthIn(min = 34.dp).clip(RoundedCornerShape(6.dp)).background(c).padding(horizontal = 6.dp), contentAlignment = Alignment.Center) {
            Text(x.c31("line", "l", "nr") ?: "", color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, maxLines = 1)
        }
        Text(x.c31("dest", "to", "destination", "t") ?: "", color = v.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        val m = x.c31("min", "mins", "minutes")
        Text(m?.let { if (it == "0") "nå" else "$it min" } ?: x.c31("time", "tm") ?: "", color = v.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1)
    }
}

@Composable
private fun PackageRow31(v: ChatV27, x: JSONObject) {
    val pr = x.optDouble("progress", -1.0).let { if (it > 1) it / 100 else it }.toFloat()
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(x.c31("name", "title", "t") ?: "Pakke", color = v.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text(x.c31("status", "s") ?: "", color = v.mut, fontFamily = PaperFonts.sans, fontSize = 12.5.sp, maxLines = 1)
        }
        if (pr >= 0f) Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(v.line)) {
            Box(Modifier.fillMaxWidth(pr.coerceIn(0f, 1f)).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(v.acc))
        }
    }
}

/* ---------- Finans ---------- */

@Composable
private fun FinanceCard31(v: ChatV27, o: JSONObject, onClick: () -> Unit) {
    val items = o.arr31("items", "top", "rows")
    Column(
        Modifier.widthIn(max = 420.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(v.card).border(1.dp, v.line, RoundedCornerShape(22.dp))
            .clickable(role = Role.Button, onClickLabel = "Åpne Finans") { Haptics.select(); onClick() }.padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text((o.c31("label", "title", "period") ?: "Brukt").uppercase(), color = v.acc, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.2.sp, maxLines = 1)
        Text(o.c31("sumText", "total", "sum", "v") ?.let { if (it.any { c -> c.isLetter() }) it else "$it kr" } ?: "–", color = v.ink, fontFamily = PaperFonts.serif, fontSize = 32.sp, maxLines = 1)
        items.take(3).forEach { x ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(x.c31("name", "merchant", "t") ?: "", color = v.ink, fontFamily = PaperFonts.sans, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text(x.c31("amountText", "amount", "v")?.let { if (it.any { c -> c.isLetter() }) it else "$it kr" } ?: "", color = v.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp)
            }
        }
    }
}

/* ---------- Huskeliste (kan krysses av i kortet) ---------- */

@Composable
private fun TasksCard31(vm: AppViewModel, v: ChatV27, o: JSONObject) {
    val items = o.arr31("items", "tasks")
    var done by remember(o.toString()) { mutableStateOf(items.filter { it.optBoolean("done", false) }.mapNotNull { it.c31("id") }.toSet()) }
    Column(
        Modifier.widthIn(max = 420.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(v.card).border(1.dp, v.line, RoundedCornerShape(22.dp)).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Row(Modifier.fillMaxWidth().clickable { Haptics.select(); vm.openTasks() }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(o.c31("title", "list") ?: "Huskeliste", color = v.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.weight(1f))
            Text("›", color = v.mut, fontSize = 18.sp)
        }
        if (items.isEmpty()) Text("Ingenting på lista.", color = v.mut, fontFamily = PaperFonts.sans, fontSize = 13.5.sp)
        items.take(8).forEach { x ->
            val id = x.c31("id")
            val on = id != null && id in done
            Row(
                Modifier.fillMaxWidth().heightIn(min = 40.dp).clickable(enabled = id != null, role = Role.Checkbox) {
                    if (id == null) return@clickable
                    done = if (on) done - id else done + id
                    vm.toggleCardTask31(id, !on)
                },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(Modifier.size(20.dp).clip(CircleShape).then(if (on) Modifier.background(v.acc) else Modifier.border(1.5.dp, v.mut, CircleShape)), contentAlignment = Alignment.Center) {
                    if (on) WxIcon("M5 12.5l4.5 4.5L19 7", Color.White, 11.dp, stroke = 3.4f)
                }
                Text(x.c31("title", "t", "text") ?: "", color = if (on) v.mut else v.ink, fontFamily = PaperFonts.sans, fontSize = 14.sp,
                    textDecoration = if (on) TextDecoration.LineThrough else null, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            }
        }
    }
}

/** PATCH /api/tasks/:id {done} direkte fra kortet. */
internal fun AppViewModel.toggleCardTask31(id: String, done: Boolean) {
    if (done) Haptics.success() else Haptics.select()
    launch31 {
        runCatching { api31 { request("PATCH", "/tasks/" + java.net.URLEncoder.encode(id, "UTF-8"), JSONObject().put("done", done), prefix = no.kristo.finanshub.Api.HOMELAB) } }
        if (tasks != null) loadTasks()
    }
}

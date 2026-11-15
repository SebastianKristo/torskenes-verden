package no.kristo.kalender.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import no.kristo.kalender.Green
import no.kristo.kalender.K70
import no.kristo.kalender.K70Cal
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red
import no.kristo.kalender.answer70
import no.kristo.kalender.move70
import no.kristo.kalender.undo70
import no.kristo.kalender.week70
import org.json.JSONObject
import java.time.LocalDate

/*
 * Prompt 70 (GLIMTCAL70): kort C i Glimt-panelet – «✓ LAGT INN», fargestrek + tittel, «tor 17. des · 17:30–20:15 · Colosseum Kino ·
 * med pappa», piller: kalender ▾ (lista folder seg ut i kortet, 44 dp rader) · Vis i uka · Angre (10 s). Spørsmål med knapper.
 */
private fun hexK70(s: String): Color = s.removePrefix("#").takeIf { it.length == 6 }?.toLongOrNull(16)?.let { Color(0xFF000000 or it) } ?: Color(0xFF7A7468)

@Composable
internal fun KalCal70Card(vm: KalVm, json: JSONObject) {
    val k = LocalK.current
    val key = json.optString("eventId")
    val first = remember(key) { K70.parse(json) } ?: return
    var c by remember(key) { mutableStateOf(first) }
    var open by remember(key) { mutableStateOf(false) }
    var busy by remember(key) { mutableStateOf(false) }
    var undone by remember(key) { mutableStateOf(false) }
    var note by remember(key) { mutableStateOf("") }
    var err by remember(key) { mutableStateOf("") }
    val until = remember(key) { System.currentTimeMillis() + first.ttlMs }
    var left by remember(key) { mutableLongStateOf(first.ttlMs / 1000) }
    LaunchedEffect(key) {
        while (true) {
            left = ((until - System.currentTimeMillis() + 999) / 1000).coerceAtLeast(0)
            if (left <= 0) break
            delay(1000)
        }
    }
    val scope = rememberCoroutineScope()
    val green = if (k.dark) Color(0xFF8FD4A8) else Green
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(if (k.dark) k.card else k.bg).border(1.dp, k.line2, RoundedCornerShape(20.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (undone) {
            Tx("↶ ANGRET", mono(10.5.sp, k.mut, .12f))
            Tx("«${c.title}» er fjernet fra kalenderen.", man(13.5.sp, FontWeight.Medium, k.mut), maxLines = 3)
            return@Column
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(18.dp).clip(CircleShape).background(Green), contentAlignment = Alignment.Center) { Tx("✓", man(11.sp, FontWeight.Bold, Color.White)) }
            Tx("LAGT INN", mono(10.5.sp, green, .12f))
        }
        Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.width(4.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(hexK70(c.calColor)))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Tx(c.title, news(19.sp, k.ink), maxLines = 2)
                Tx(c.line, man(12.5.sp, FontWeight.Medium, k.mut), maxLines = 3)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.height(34.dp).clip(CircleShape).background(k.card).border(1.dp, k.line, CircleShape)
                    .tap("Kalender: ${c.calName}. Bytt kalender") { if (!busy) { err = ""; open = !open } }.padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                Box(Modifier.size(9.dp).clip(CircleShape).background(hexK70(c.calColor)))
                Tx(c.calName, man(12.5.sp, FontWeight.SemiBold, k.ink))
                Tx("▾", man(12.sp, FontWeight.SemiBold, k.mut), Modifier.rotate(if (open) 180f else 0f))
            }
            Box(
                Modifier.height(34.dp).clip(CircleShape).background(k.card).border(1.dp, k.line, CircleShape).tap("Vis i uka") { vm.week70(c.date) }.padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) { Tx("Vis i uka", man(12.5.sp, FontWeight.SemiBold, k.ink)) }
            if (left > 0) Box(
                Modifier.height(34.dp).clip(CircleShape).background(k.card).border(1.dp, k.line, CircleShape)
                    .tap("Angre, $left sekunder igjen") {
                        if (!busy) { busy = true; err = ""; scope.launch { val e = vm.undo70(c); if (e == null) undone = true else err = e; busy = false } }
                    }.padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) { Tx("Angre", man(12.5.sp, FontWeight.SemiBold, k.ink)) }
        }
        AnimatedVisibility(open, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Tx("LEGG I", mono(10.sp, k.mut, .12f))
                c.calendars.forEach { x ->
                    K70Row(x, x.id == c.calId, green) {
                        if (busy) return@K70Row
                        if (x.id == c.calId) { open = false; return@K70Row }
                        busy = true; err = ""
                        scope.launch {
                            val (n, e) = vm.move70(c, x.id)
                            if (n != null) { c = n; note = "Flyttet til ${n.calName}"; open = false }
                            if (e != null) err = e
                            busy = false
                        }
                    }
                }
            }
        }
        if (err.isNotBlank()) Tx(err, man(12.5.sp, FontWeight.SemiBold, Red), maxLines = 3)
        else if (note.isNotBlank()) Tx(note, man(12.5.sp, FontWeight.SemiBold, green))
    }
}

@Composable
private fun K70Row(x: K70Cal, on: Boolean, green: Color, onClick: () -> Unit) {
    val k = LocalK.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(14.dp)).background(if (on) k.card else Color.Transparent)
            .tap(x.name, onClick = onClick).semantics { selected = on }.padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(11.dp).clip(CircleShape).background(hexK70(x.color)))
        Column(Modifier.weight(1f)) {
            Tx(x.name, man(14.sp, FontWeight.SemiBold, k.ink))
            if (x.sub.isNotBlank()) Tx(x.sub, man(11.5.sp, FontWeight.Medium, k.mut))
        }
        Tx(if (on) "✓" else "", man(14.sp, FontWeight.Bold, green))
    }
}

/** Spørsmålet (bare når noe mangler) som knapper i panelet. «Velg dato» → dagvelger i panelet. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun KalCal70Ask(vm: KalVm, ask: JSONObject) {
    val k = LocalK.current
    val key = ask.toString()
    var gone by remember(key) { mutableStateOf(false) }
    var dateFor by remember(key) { mutableStateOf("") }
    var day by remember(key) { mutableStateOf(LocalDate.now()) }
    if (gone) return
    val field = ask.optString("field")
    val text = ask.optString("text")
    val arr = ask.optJSONArray("options")
    val opts = (0 until (arr?.length() ?: 0)).mapNotNull { arr?.optJSONObject(it) }.filter { it.optString("label").isNotBlank() }
    Column(Modifier.semantics { contentDescription = ask.optString("question") }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            opts.forEach { o ->
                val label = o.optString("label")
                Box(
                    Modifier.heightIn(min = 36.dp).clip(CircleShape).border(1.dp, k.line, CircleShape).tap(label) {
                        val t = o.optString("text")
                        when {
                            o.optBoolean("cancel", false) -> gone = true
                            t.contains("{dato}") -> dateFor = t
                            field == "calendar" && text.isNotBlank() -> { gone = true; vm.answer70(text, JSONObject().put("calendarId", o.optString("id"))) }
                            else -> { gone = true; vm.answer70(t.ifBlank { label }, null) }
                        }
                    }.padding(horizontal = 13.dp, vertical = 8.dp),
                    contentAlignment = Alignment.Center,
                ) { Tx(label, man(13.sp, FontWeight.SemiBold, k.ink)) }
            }
        }
        if (dateFor.isNotBlank()) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            val today = LocalDate.now()
            val wd = listOf("man", "tir", "ons", "tor", "fre", "lør", "søn")[day.dayOfWeek.value - 1]
            val mn = listOf("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")[day.monthValue - 1]
            listOf("«" to -7L, "‹" to -1L).forEach { (s, d) -> K70Step(s) { if (!day.plusDays(d).isBefore(today)) day = day.plusDays(d) } }
            Tx("$wd ${day.dayOfMonth}. $mn${if (day.year != today.year) " ${day.year}" else ""}", man(13.5.sp, FontWeight.Bold, k.ink))
            listOf("›" to 1L, "»" to 7L).forEach { (s, d) -> K70Step(s) { day = day.plusDays(d) } }
            InkPill("Legg inn", {
                gone = true
                vm.answer70(dateFor.replace("{dato}", "%02d.%02d.%04d".format(day.dayOfMonth, day.monthValue, day.year)), null)
            }, h = 36.dp, padH = 14.dp, fs = 13.sp)
        }
    }
}

@Composable
private fun K70Step(s: String, onClick: () -> Unit) {
    val k = LocalK.current
    val label = when (s) { "«" -> "En uke tilbake"; "‹" -> "En dag tilbake"; "›" -> "En dag fram"; else -> "En uke fram" }
    Box(Modifier.size(36.dp).clip(CircleShape).border(1.dp, k.line, CircleShape).tap(label, onClick = onClick), contentAlignment = Alignment.Center) {
        Tx(s, man(15.sp, FontWeight.Bold, k.ink))
    }
}

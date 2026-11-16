package no.kristo.finanshub.ui

import androidx.compose.runtime.saveable.rememberSaveable
import no.kristo.finanshub.ui.designsystem.HomelabType
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Cal70
import no.kristo.finanshub.Cal70Cal
import no.kristo.finanshub.ChoiceItem67
import no.kristo.finanshub.Choices67
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.move70
import no.kristo.finanshub.openKal26
import no.kristo.finanshub.undo70
import org.json.JSONObject
import java.time.LocalDate
import no.kristo.finanshub.ui.designsystem.DsPalette
import no.kristo.felles.tid.OsloDato

/*
 * Prompt 70 (GLIMTCAL70): kort A – «✓ LAGT I KALENDEREN», datoblokk, «Kino: Dune», «17:30–20:15 · Colosseum Kino», «Med pappa»,
 * kalender-pillen (fargeprikk + navn ▾) og varsel, «Åpne i Kalender» og «Angre» (10 s). Pillen folder ut lista INNE i kortet (B):
 * 44 dp rader med fargeprikk, navn og kilde, ✓ på valgt, «Foreslått» øverst; valget flytter avtalen (PATCH {calendarId}).
 * Ingen dialog, ingen ark. dark = inne i den mørke Hjem-boblen (uten egen flate); ellers eget mørkt kort (Chat).
 */
@Composable
internal fun Cal70Card(vm: AppViewModel, json: JSONObject, inBubble: Boolean) {
    val key = json.optString("eventId")
    val first = remember(key) { Cal70.parse(json) } ?: return
    var c by remember(key) { mutableStateOf(first) }
    var open by remember(key) { mutableStateOf(false) }
    var busy by remember(key) { mutableStateOf(false) }
    var undone by remember(key) { mutableStateOf(false) }
    var note by rememberSaveable(key) { mutableStateOf("") }
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
    val ink = DsPalette.PapirMork.textPrimary
    val mut = ink.copy(alpha = .8f)
    val green = DsPalette.PapirMork.success
    val pillBg = Color.White.copy(alpha = .12f)
    val sans = PaperFonts.sans
    val outer = if (inBubble) Modifier.fillMaxWidth() else Modifier.fillMaxWidth().clip(RoundedCornerShape(26.dp)).background(DsPalette.PapirMork.surface.copy(alpha = .92f)).padding(16.dp)
    Column(outer, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (undone) {
            Text("↶ ANGRET", color = mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = HomelabType.caption.fontSize, letterSpacing = 1.2.sp)
            Text("«${c.title}» er fjernet fra kalenderen.", color = mut, fontFamily = sans, fontWeight = FontWeight.Medium, fontSize = HomelabType.callout.fontSize)
            return@Column
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(18.dp).clip(CircleShape).background(DsPalette.Category.green), contentAlignment = Alignment.Center) {
                Text("✓", color = Color.White, fontFamily = sans, fontWeight = FontWeight.Bold, fontSize = HomelabType.caption.fontSize)
            }
            Text("LAGT I KALENDEREN", color = green, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = HomelabType.caption.fontSize, letterSpacing = 1.2.sp)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(
                Modifier.width(52.dp).clip(RoundedCornerShape(14.dp)).background(DsPalette.PapirLys.surfaceRaised).padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(c.mon, color = DsPalette.PapirLys.accent, fontFamily = sans, fontWeight = FontWeight.Bold, fontSize = HomelabType.caption.fontSize)
                Text(c.n.toString(), color = DsPalette.PapirLys.textPrimary, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = HomelabType.title3.fontSize)
                Text(c.wd, color = DsPalette.PapirLys.textSecondary, fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = HomelabType.caption.fontSize)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(c.title, color = ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = HomelabType.title3.fontSize, lineHeight = 24.sp)
                Text(c.line, color = mut, fontFamily = sans, fontWeight = FontWeight.Medium, fontSize = HomelabType.subheadline.fontSize)
                if (c.withText.isNotBlank()) Text(c.withText, color = mut, fontFamily = sans, fontWeight = FontWeight.Medium, fontSize = HomelabType.subheadline.fontSize)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.height(34.dp).clip(CircleShape).background(pillBg)
                    .press24(!busy) { Haptics.select(); err = ""; open = !open }
                    .semantics { role = Role.Button; contentDescription = "Kalender: ${c.calName}. Bytt kalender" }
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                Box(Modifier.size(9.dp).clip(CircleShape).background(hex70(c.calColor)))
                Text(c.calName, color = ink, fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = HomelabType.footnote.fontSize, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("▾", color = ink.copy(alpha = .7f), fontSize = HomelabType.footnote.fontSize, modifier = Modifier.rotate(if (open) 180f else 0f))
            }
            Box(Modifier.height(34.dp).clip(CircleShape).background(pillBg).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                Text(c.reminder, color = ink, fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = HomelabType.footnote.fontSize, maxLines = 1)
            }
        }
        AnimatedVisibility(open, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("LEGG I", color = ink.copy(alpha = .55f), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = HomelabType.caption.fontSize, letterSpacing = 1.2.sp)
                c.calendars.forEach { x ->
                    Cal70Row(x, x.id == c.calId, ink, green, pillBg, sans, !busy) {
                        if (x.id == c.calId) { open = false; return@Cal70Row }
                        Haptics.select(); busy = true; err = ""
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
        if (err.isNotBlank()) Text(err, color = DsPalette.PapirMork.danger, fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = HomelabType.footnote.fontSize)
        else if (note.isNotBlank()) Text(note, color = green, fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = HomelabType.footnote.fontSize)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                Modifier.weight(1f).height(40.dp).clip(CircleShape).background(ink).press24 { Haptics.tap(); vm.openKal26(c.eventId) }
                    .semantics { role = Role.Button },
                contentAlignment = Alignment.Center,
            ) { Text("Åpne i Kalender", color = DsPalette.PapirLys.textPrimary, fontFamily = sans, fontWeight = FontWeight.Bold, fontSize = HomelabType.subheadline.fontSize, maxLines = 1) }
            if (left > 0) Row(
                Modifier.height(40.dp).clip(CircleShape).background(pillBg)
                    .press24(!busy) {
                        Haptics.tap(); busy = true; err = ""
                        scope.launch { val e = vm.undo70(c); if (e == null) undone = true else err = e; busy = false }
                    }
                    .semantics { role = Role.Button; contentDescription = "Angre, $left sekunder igjen" }
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text("Angre", color = ink, fontFamily = sans, fontWeight = FontWeight.Bold, fontSize = HomelabType.subheadline.fontSize)
                Text(left.toString(), color = ink.copy(alpha = .65f), fontFamily = PaperFonts.mono, fontSize = HomelabType.caption.fontSize)
            }
        }
    }
}

@Composable
private fun Cal70Row(x: Cal70Cal, on: Boolean, ink: Color, green: Color, onBg: Color, font: FontFamily, enabled: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(14.dp)).background(if (on) onBg else Color.Transparent)
            .press24(enabled, onClick).semantics { role = Role.Button; selected = on }.padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(11.dp).clip(CircleShape).background(hex70(x.color)))
        Column(Modifier.weight(1f)) {
            Text(x.name, color = ink, fontFamily = font, fontWeight = FontWeight.SemiBold, fontSize = HomelabType.callout.fontSize)
            if (x.sub.isNotBlank()) Text(x.sub, color = ink.copy(alpha = .6f), fontFamily = font, fontWeight = FontWeight.Medium, fontSize = HomelabType.caption.fontSize)
        }
        Text(if (on) "✓" else "", color = green, fontFamily = font, fontWeight = FontWeight.Bold, fontSize = HomelabType.callout.fontSize)
    }
}

internal fun hex70(s: String): Color = s.removePrefix("#").takeIf { it.length == 6 }?.toLongOrNull(16)?.let { Color(0xFF000000 or it) } ?: DsPalette.Category.neutral

/**
 * Valgknappene med «Velg dato»: datovelgeren vises i kortet (‹ dag › og ±1 uke), og datoen sendes som ny tekst (uten choice),
 * så serveren tolker den («legg til tannlege {dato}» → «legg til tannlege 17.12.2026»).
 */
@Composable
internal fun Cal70Choices(ch: Choices67, fg: Color, bg: Color, line: Color, font: FontFamily, onPick: (ChoiceItem67) -> Unit, onDate: (String) -> Unit) {
    var dateFor by remember(ch) { mutableStateOf("") }
    var day by remember(ch) { mutableStateOf(OsloDato.iDag()) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Choices67Row(ch, fg, bg, line, font) { if (it.text.contains("{dato}")) dateFor = it.text else onPick(it) }
        if (dateFor.isNotBlank()) Cal70DateRow(day, fg, bg, line, font, { day = it }) { onDate(Cal70.fill(dateFor, day)) }
    }
}

@Composable
private fun Cal70DateRow(day: LocalDate, fg: Color, bg: Color, line: Color, font: FontFamily, set: (LocalDate) -> Unit, done: () -> Unit) {
    val today = OsloDato.iDag()
    val wd = listOf("man", "tir", "ons", "tor", "fre", "lør", "søn")[day.dayOfWeek.value - 1]
    val mn = listOf("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")[day.monthValue - 1]
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf("«" to -7L, "‹" to -1L).forEach { (t, d) -> Step70(t, fg, line, font, day.plusDays(d) >= today) { set(day.plusDays(d)) } }
        Text("$wd ${day.dayOfMonth}. $mn${if (day.year != today.year) " ${day.year}" else ""}", color = fg, fontFamily = font, fontWeight = FontWeight.Bold, fontSize = HomelabType.subheadline.fontSize,
            modifier = Modifier.semantics { contentDescription = "Valgt dato" })
        listOf("›" to 1L, "»" to 7L).forEach { (t, d) -> Step70(t, fg, line, font, true) { set(day.plusDays(d)) } }
        Box(
            Modifier.height(36.dp).clip(CircleShape).background(bg).border(1.dp, line, CircleShape).press24 { Haptics.select(); done() }
                .semantics { role = Role.Button }.padding(horizontal = 14.dp),
            contentAlignment = Alignment.Center,
        ) { Text("Legg inn", color = fg, fontFamily = font, fontWeight = FontWeight.Bold, fontSize = HomelabType.subheadline.fontSize) }
    }
}

@Composable
private fun Step70(t: String, fg: Color, line: Color, font: FontFamily, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(36.dp).clip(CircleShape).border(1.dp, line, CircleShape).press24(enabled) { Haptics.select(); onClick() }
            .semantics { role = Role.Button; contentDescription = when (t) { "«" -> "En uke tilbake"; "‹" -> "En dag tilbake"; "›" -> "En dag fram"; else -> "En uke fram" } },
        contentAlignment = Alignment.Center,
    ) { Text(t, color = if (enabled) fg else fg.copy(alpha = .35f), fontFamily = font, fontWeight = FontWeight.Bold, fontSize = HomelabType.callout.fontSize) }
}

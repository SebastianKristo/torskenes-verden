package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/*
 * Prompt 73 (BRIEF73): INNHOLD I BRIEFEN (Innstillinger → Glimt og ⚙-arket i briefen) og kortene i briefen med cache/skjelett.
 * Fasit: Glimt Brief.dc.html (mode settings, BK0) og claude-code-brief-kort-lastes-straks.md. Data: P73Brief.kt.
 */

private val HM73: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

@Composable
private fun Switch73(on: Boolean) {
    Box(Modifier.size(44.dp, 26.dp).clip(RoundedCornerShape(13.dp)).background(if (on) Color(0xFF2F7A4F) else Color(0xFFDDD5C5)).padding(3.dp),
        contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) { Box(Modifier.size(20.dp).clip(CircleShape).background(Color.White)) }
}

@Composable
private fun Arrow73(up: Boolean, dim: Boolean, label: String, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.size(28.dp, 22.dp).clip(RoundedCornerShape(6.dp)).background(p.surf2).graphicsLayer { alpha = if (dim) .35f else 1f }
        .clickable(enabled = !dim, role = Role.Button, onClickLabel = label) { onClick() }, contentAlignment = Alignment.Center) {
        Text(if (up) "⌃" else "⌄", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, lineHeight = 13.sp)
    }
}

/** «INNHOLD I BRIEFEN · 8 av 11 på»: pil opp/ned, tittel + kilde, bryter. Hele raden slår av/på; langt trykk + dra flytter. */
@Composable
internal fun Brief73Settings(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(vm.account?.id) { vm.loadBriefCards73(force = true) }
    val items = B73.items
    val rowPx = with(LocalDensity.current) { 53.dp.toPx() }
    var dragKey by remember { mutableStateOf<String?>(null) }
    var dragY by remember { mutableFloatStateOf(0f) }
    var slot by remember { mutableIntStateOf(0) }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 4.dp, start = 4.dp, end = 4.dp), verticalAlignment = Alignment.Bottom) {
            Text("INNHOLD I BRIEFEN", color = Color(0xFFA39D90), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp, modifier = Modifier.weight(1f))
            Text(B73.countText, color = Color(0xFF8A8478), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
        }
        Text("Velg hvilke kort som er med og rekkefølgen de vises i. Gjelder Now Brief på mobil, web og widgets.", color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp,
            modifier = Modifier.padding(horizontal = 4.dp))
        PCard {
            items.forEachIndexed { i, it ->
                key(it.key) {
                    val dragging = dragKey == it.key
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 52.dp)
                            .graphicsLayer { translationY = if (dragging) dragY else 0f; shadowElevation = if (dragging) 8f else 0f }
                            .background(if (dragging) p.card else Color.Transparent)
                            .pointerInput(it.key, i) {
                                detectDragGesturesAfterLongPress(
                                    onDragStart = { _ -> dragKey = it.key; dragY = 0f; slot = 0; Haptics.tap() },
                                    onDrag = { ch, d -> ch.consume(); dragY += d.y; val s = Math.round(dragY / rowPx); if (s != slot) { slot = s; Haptics.tap() } },
                                    onDragEnd = { vm.placeBriefCard73(it.key, i + Math.round(dragY / rowPx)); dragKey = null; dragY = 0f; slot = 0 },
                                    onDragCancel = { dragKey = null; dragY = 0f; slot = 0 },
                                )
                            }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Arrow73(true, i == 0, "Flytt ${it.title} opp") { vm.moveBriefCard73(it.key, -1) }
                            Arrow73(false, i == items.size - 1, "Flytt ${it.title} ned") { vm.moveBriefCard73(it.key, 1) }
                        }
                        Row(Modifier.weight(1f).clickable(role = Role.Switch, onClickLabel = if (it.on) "Skjul ${it.title}" else "Vis ${it.title}") { vm.toggleBriefCard73(it.key) },
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Column(Modifier.weight(1f).graphicsLayer { alpha = if (it.on) 1f else .45f }) {
                                Text(it.title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(it.sub, color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            Switch73(it.on)
                        }
                    }
                }
            }
        }
        Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).border(1.dp, Color(0xFFDDD5C5), RoundedCornerShape(17.dp))
            .clickable(role = Role.Button) { vm.resetBriefCards73() }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text("Tilbakestill", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
        }
        B73.err?.let { Text(it, color = Color(0xFFB23A2A), fontWeight = FontWeight.Bold, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp)) }
    }
}

/** Skjelett i full høyde: tittel og grå linjer i papirstil. Ingen spinner, ingen innfading. */
@Composable
internal fun Skeleton73(key: String) {
    val p = PaperPal.current
    val title = B73.title(key)
    Column(Modifier.fillMaxWidth().heightIn(min = B73.height(key).dp).clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp, 14.dp)
        .semantics { contentDescription = "$title lastes" }, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        PSerif(title, 20.sp, p.ink, maxLines = 1)
        listOf(.72f, .54f, .63f).forEach { w -> Box(Modifier.fillMaxWidth(w).height(12.dp).clip(RoundedCornerShape(6.dp)).background(p.line)) }
    }
}

/** Kort uten innhold (eller som ikke kunne hentes): kort tomtekst, kortet blir stående. */
@Composable
internal fun Empty73(title: String, text: String, minH: Int = 0, retry: (() -> Unit)? = null) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().heightIn(min = minH.dp).clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PSerif(title, 20.sp, p.ink, maxLines = 1)
        Text(text, color = p.mut, fontSize = 13.5.sp)
        if (retry != null) Box(Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).border(1.dp, Color(0xFFDDD5C5), RoundedCornerShape(16.dp))
            .clickable(role = Role.Button) { retry() }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text("Prøv igjen", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
        }
    }
}

/** Et kort fra /api/brief52: cache → innhold (+ «Oppdatert kl. …» ved tidsavbrudd), ellers skjelett eller «Klarte ikke hente». */
@Composable
internal fun Card52Slot73(vm: AppViewModel, key: String) {
    val p = PaperPal.current
    val id = B73.B52[key] ?: return
    val c = B73.cards[id]
    val st = B73.state[id]
    when {
        c != null -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            BriefCard52(vm, c)
            if (st == "stale") Row(Modifier.padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                val t = B73.at[id]?.takeIf { it > 0 }?.let { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).format(HM73) }
                Text(if (t != null) "Oppdatert kl. $t" else "Klarte ikke hente", color = p.mut, fontSize = 12.sp)
                Text("Prøv igjen", color = Color(0xFFB23A2A), fontWeight = FontWeight.Bold, fontSize = 12.sp, textDecoration = TextDecoration.Underline,
                    modifier = Modifier.clickable(role = Role.Button) { vm.retryBriefCard73(id) })
            }
        }
        st == "fail" -> Empty73(B73.title(key), "Klarte ikke hente", B73.height(key)) { vm.retryBriefCard73(id) }
        else -> Skeleton73(key)
    }
}

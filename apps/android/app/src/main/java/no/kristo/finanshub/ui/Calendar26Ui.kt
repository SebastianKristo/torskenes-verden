package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit

/*
 * Prompt 26 (ANDROID-A): Hjem-kortet KALENDER. Selve Kalender-siden er erstattet av Kalender v2 i prompt 27
 * (Calendar27Ui.kt, KalenderScreen27): kortene, rediger-modusen og widget-forhåndsvisningene nederst er fjernet.
 */

@Composable
private fun KMono(text: String, color: Color, size: TextUnit = 10.5.sp, modifier: Modifier = Modifier, spacing: TextUnit = 1.3.sp) =
    Text(text, color = color, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = size, letterSpacing = spacing, maxLines = 1,
        overflow = TextOverflow.Ellipsis, modifier = modifier)

/** Minuttet nå (oppdateres hvert minutt). */
@Composable
private fun rememberMinute(): LocalDateTime {
    var now by remember { mutableStateOf(LocalDateTime.now()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000L - (LocalDateTime.now().second * 1000L) + 200L)
            now = LocalDateTime.now()
        }
    }
    return now
}

/* ---------------- Hjem-widgeten KALENDER ---------------- */

/** Hjem: NÅ / NESTE TIME / ukedag, fag i Newsreader med fargestripe, rom og lærer, klokkeslett, tre neste timer og NESTE PRØVE. */
@Composable
internal fun HomeKalCard26(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.kal26
    LaunchedEffect(vm.base) { if (s.events == null) vm.loadKal26(quiet = true) }
    val now = rememberMinute()
    val w = kalWidget(s.events ?: emptyList(), now, s.subjectColors)
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).press24 { vm.openKal26() }.padding(16.dp, 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            KMono("KALENDER · " + w.k, p.lab, modifier = Modifier.weight(1f))
            Text(w.dayT + " ›", color = p.mut, fontSize = 12.sp, maxLines = 1)
        }
        if (s.events == null) { Text("Henter kalenderen …", color = p.mut, fontSize = 13.sp); return@Column }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(5.dp, 44.dp).clip(RoundedCornerShape(3.dp)).background(Color(w.color)))
            Column(Modifier.weight(1f)) {
                PSerif(w.title, 22.sp, maxLines = 1)
                if (w.sub.isNotBlank()) Text(w.sub, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(w.big, color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 26.sp, lineHeight = 26.sp, maxLines = 1)
                if (w.whenText.isNotBlank()) Text(w.whenText, color = p.lab, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, maxLines = 1)
            }
        }
        if (w.n3.isNotEmpty()) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            w.n3.forEach { e ->
                Row(Modifier.weight(1f).height(IntrinsicSize.Min).clip(RoundedCornerShape(12.dp)).background(p.bg)) {
                    Box(Modifier.width(3.dp).fillMaxHeight().background(Color(e.color)))
                    Column(Modifier.padding(start = 6.dp, top = 7.dp, end = 9.dp, bottom = 7.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(e.s, color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Medium, fontSize = 12.sp, maxLines = 1)
                        Text(e.short, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        w.ex.firstOrNull()?.let { x ->
            Column {
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    KMono("NESTE PRØVE", p.lab, 10.sp, spacing = .8.sp)
                    Text(x.title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Box(Modifier.clip(CircleShape).background(if (x.red) Color(KAL_LAB) else p.bg).padding(horizontal = 8.dp, vertical = 3.dp)) {
                        Text(x.inText, color = if (x.red) Color.White else p.ink, fontWeight = FontWeight.ExtraBold, fontSize = 10.5.sp, maxLines = 1)
                    }
                }
            }
        }
    }
}

package no.kristo.finanshub.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/*
 * Prompt 34 (ANDROID34): felles UI-biter – innholdet under fanelinjen (underNav34), markeringen i Innstillinger (hl34 + boble),
 * «✦ ANALYSERES AV AI» i Kvitteringer, systemmappen i Chat og knappene på AI-feil.
 */

/* ---------------- Innhold under fanelinjen ---------------- */

/** Boksen tegnes [up] høyere enn plassen sin og flyttes like mye opp: toppen ligger i fotovinduet, bunnen ved skjermkanten. */
internal fun Modifier.underNav34(up: Dp): Modifier = this.layout { m, c ->
    val e = up.roundToPx()
    val maxH = if (c.hasBoundedHeight) c.maxHeight + e else c.maxHeight
    val pl = m.measure(c.copy(minHeight = (c.minHeight + e).coerceAtMost(maxH), maxHeight = maxH))
    layout(pl.width, (pl.height - e).coerceAtLeast(0)) { pl.place(0, -e) }
}

/* ---------------- Markering i Innstillinger ---------------- */

/**
 * Målet for AI-søket: scrolles fram og får en rød ring som pulserer (3 dp #b23a2a + utvidende glød, 1,4 s × 4).
 * Forsvinner etter 6 s eller ved første trykk.
 */
@OptIn(ExperimentalFoundationApi::class)
internal fun Modifier.hl34(vm: AppViewModel, anchor: String, radius: Dp = 20.dp): Modifier = composed {
    val on = vm.p34.hl == anchor
    val seq = vm.p34.hlSeq
    val req = remember { BringIntoViewRequester() }
    LaunchedEffect(on, seq) {
        if (!on) return@LaunchedEffect
        delay(380)
        runCatching { req.bringIntoView() }
        delay(5600)
        if (vm.p34.hl == anchor && vm.p34.hlSeq == seq) vm.p34.hl = null
    }
    val base = this.bringIntoViewRequester(req)
    if (!on) return@composed base
    val red = Color(0xFFB23A2A)
    val t = rememberInfiniteTransition(label = "hl34")
    val v by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1400, easing = LinearEasing), RepeatMode.Restart), label = "hl34v")
    base
        .pointerInput(seq) {
            awaitPointerEventScope {
                while (true) {
                    val ev = awaitPointerEvent(PointerEventPass.Initial)
                    if (ev.changes.any { it.pressed }) { vm.p34.hl = null; break }
                }
            }
        }
        .drawWithContent {
            drawContent()
            val r = radius.toPx()
            val w = 3.dp.toPx()
            val g = 14.dp.toPx() * v
            drawRoundRect(red.copy(alpha = .45f * (1f - v)), topLeft = Offset(-g, -g), size = Size(size.width + 2 * g, size.height + 2 * g),
                cornerRadius = CornerRadius(r + g, r + g), style = Stroke(width = 6.dp.toPx() * (1f - v) + 1f))
            drawRoundRect(red, topLeft = Offset(w / 2, w / 2), size = Size(size.width - w, size.height - w), cornerRadius = CornerRadius(r, r), style = Stroke(w))
        }
}

/** Mørk boble over målet («✦ Trykk her for å oppdatere»), bare mens markeringen står. */
@Composable
internal fun Hl34Bubble(vm: AppViewModel, anchor: String) {
    if (vm.p34.hl != anchor) return
    val text = ANCHORS34.firstOrNull { it.id == anchor }?.bubble ?: return
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Text(text, color = Color(0xFFF3EFE6), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp,
            modifier = Modifier.clip(RoundedCornerShape(14.dp)).background(Color(0xFF1B1A17)).padding(horizontal = 14.dp, vertical = 8.dp))
    }
}

/* ---------------- Kvitteringer: «✦ ANALYSERES AV AI · N» ---------------- */

/** Seksjonen over KØ og TIL GJENNOMGANG. Tom liste = ingenting vises. */
@Composable
internal fun RcAiSection34(vm: AppViewModel) {
    val p = PaperPal.current
    val l = vm.p34.rcAi
    LaunchedEffect(vm.base, vm.jobs.size, vm.uploading) { vm.loadRcAi34() }
    if (l.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("✦ ANALYSERES AV AI · ${l.size}", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp,
            modifier = Modifier.padding(start = 4.dp, top = 6.dp))
        l.forEach { r -> RcAiCard34(vm, r) }
    }
}

@Composable
private fun RcAiCard34(vm: AppViewModel, r: RcAi34) {
    val p = PaperPal.current
    val t = rememberInfiniteTransition(label = "scan34")
    val y by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1600, easing = LinearEasing), RepeatMode.Reverse), label = "scan34y")
    val title = r.store ?: "Leser kvittering …"
    val sub = when {
        r.category != null -> r.category + (r.confidence?.let { " · $it % sikker" } ?: "")
        r.lines != null -> "${r.lines} varelinjer"
        else -> r.file
    }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).border(1.dp, p.lab.copy(alpha = .22f), RoundedCornerShape(20.dp)).padding(16.dp, 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(46.dp, 58.dp).clip(RoundedCornerShape(8.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(8.dp))) {
                ServerImage(vm, r.thumb ?: "/finans/api/receipts/${r.id}/thumb", Modifier.matchParentSize())
                // Rød skannelinje som glir over bildet.
                Box(Modifier.fillMaxWidth().height(2.dp).offset(y = (56 * y).dp).background(p.lab))
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(sub, color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                r.model?.let { m ->
                    Text(m, color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, maxLines = 1,
                        modifier = Modifier.padding(top = 2.dp).clip(CircleShape).background(p.bg).padding(horizontal = 8.dp, vertical = 1.dp))
                }
            }
            r.sum?.let { s -> Text(String.format(java.util.Locale("nb", "NO"), "%.2f", s), color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, maxLines = 1) }
        }
        Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(p.bg)) {
            Box(Modifier.fillMaxHeight().fillMaxWidth((maxOf(r.pct, r.step * 20) / 100f).coerceIn(.04f, 1f)).clip(RoundedCornerShape(3.dp)).background(p.lab))
        }
        Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
            r.steps.forEachIndexed { i, n ->
                val done = i < r.step
                val act = i == r.step
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(
                        Modifier.size(15.dp).clip(CircleShape).background(if (done) p.pos else Color.Transparent)
                            .then(if (done) Modifier else Modifier.border(if (act) 2.dp else 1.5.dp, if (act) p.lab else p.line, CircleShape)),
                        contentAlignment = Alignment.Center,
                    ) { if (done) Text("✓", color = Color.White, fontSize = 8.5.sp, fontWeight = FontWeight.ExtraBold) }
                    Text(n, color = if (done || act) p.ink else p.mut, fontFamily = PaperFonts.sans, fontWeight = if (act) FontWeight.Bold else FontWeight.Medium, fontSize = 13.sp)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp)).press24 { vm.followRcChat34(r) }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center) { Text("Følg i Chat ›", color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
            Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).press24 { vm.cancelRcAi34(r) }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center) { Text("Avbryt", color = p.lab, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
        }
    }
}

/* ---------------- Chat: «Kvitteringer og skanninger» ---------------- */

/** Mappen øverst under MAPPER: rødt kvitteringsikon, antall og «· N til godkjenning». Lukket som standard; kan ikke slettes eller gis nytt navn. */
@Composable
internal fun ScanFolderRow34(vm: AppViewModel, ink: Color, sans: androidx.compose.ui.text.font.FontFamily, row: @Composable (ChatRow27) -> Unit) {
    val f = vm.p34.scanFolder ?: return
    val s = vm.chat27
    val open = s.folderOpen[f.id] ?: false
    Row(Modifier.fillMaxWidth().heightIn(min = 40.dp).clip(RoundedCornerShape(12.dp)).press24 { Haptics.select(); s.folderOpen = s.folderOpen + (f.id to !open) }.padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(if (open) "▾" else "▸", color = ink.copy(alpha = .6f), fontSize = 11.sp, modifier = Modifier.width(12.dp))
        WxIcon("M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4", Color(0xFFB23A2A), 17.dp, stroke = 1.9f)
        val rv = vm.p34.scanReview
        Text("${f.name} · ${f.chats.size}" + if (rv > 0) " · $rv til godkjenning" else "", color = ink, fontFamily = sans, fontWeight = FontWeight.Bold, fontSize = 14.sp,
            maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    if (open) f.chats.forEach { row(it) }
}

/* ---------------- AI-feil: Prøv igjen / Åpne AI-kontroll ---------------- */

@Composable
internal fun AiErrActions34(vm: AppViewModel, fg: Color, bg: Color, retry: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.height(32.dp).clip(CircleShape).background(bg).press24 { Haptics.tap(); retry() }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text("Prøv igjen", color = fg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
        }
        Box(Modifier.height(32.dp).clip(CircleShape).background(bg).press24 { vm.openAiCtl34("ov") }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text("Åpne AI-kontroll ›", color = fg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
        }
    }
}

/** Rad i Innstillinger → App: «AI og modeller» åpner AI-kontroll i fullskjerm. */
@Composable
internal fun AiSettingsRow34(vm: AppViewModel, i: Int) {
    Box(Modifier.hl34(vm, "ai-mod", 0.dp)) {
        SetRow(vm, i, Icons.Filled.Memory, "AI og modeller", "Glimt · modeller, jobber, forbruk og nøkler") { vm.openAiCtl34("ov") }
    }
}

/** Glimt-søket i Innstillinger: knappen «Vis meg nå ›» og automatisk navigering etter 1,6 s når svaret har et mål. */
@Composable
internal fun ShowMeNow34(vm: AppViewModel, target: String, label: String = "Vis meg nå ›") {
    val p = PaperPal.current
    LaunchedEffect(target, vm.b24.aiAnswer) {
        delay(1600)
        if (vm.b24.sq.isNotBlank() && vm.b24.aiAnswer != null) vm.goAnchor34(target)
    }
    Box(
        Modifier.height(36.dp).clip(CircleShape).background(p.ink).press24 { Haptics.select(); vm.goAnchor34(target) }.padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
}


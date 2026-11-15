package no.kristo.finanshub.ui

import android.graphics.Bitmap
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.RcLine30
import no.kristo.finanshub.TxReceipt
import no.kristo.finanshub.hlMatch30
import no.kristo.finanshub.loadBoxes30
import no.kristo.finanshub.rereadReceipt30

/*
 * Prompt 30 (ANDROID30) – claude-code-kvittering-highlight.md: når en transaksjon åpnes fra Søk (eller Liste med søketekst)
 * markeres linjene i kvitteringen: gult banner over («‹tomat› står på linje 3 · 24,90 kr», Fjern), gul linje med kant og
 * fet tekst, selve ordet som markeringstusj, og pulsering to ganger. Har kvitteringen bbox per linje, vises bildet med gule
 * rektangler og zoom til første treff (klyp for å zoome). Uten bbox: «Les kvitteringen på nytt».
 */

internal val HL_LINE30 = Color(0x6BFFCD28)
internal val HL_EDGE30 = Color(0xFFE0A800)
internal val HL_WORD30 = Color(0xFFFFD23F)

/** Linjeteksten med ordet markert. */
internal fun hlText30(text: String, terms: List<String>): AnnotatedString {
    val r = hlMatch30(text, terms)
    if (r == null || r.isEmpty()) return AnnotatedString(text)
    return buildAnnotatedString {
        append(text.substring(0, r.first))
        withStyle(SpanStyle(background = HL_WORD30)) { append(text.substring(r.first, r.last + 1)) }
        append(text.substring(r.last + 1))
    }
}

/** Gult banner: trykk på teksten scroller til linjen igjen, Fjern skjuler markeringen. */
@Composable
internal fun HlBanner30(term: String, lineNo: Int, price: String, more: Int, onGo: () -> Unit, onClear: () -> Unit) {
    val ink = Color(0xFF3A2F00)
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color(0xFFFFF4C2)).padding(start = 12.dp, top = 8.dp, end = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(10.dp).clip(RoundedCornerShape(3.dp)).background(HL_WORD30).border(1.5.dp, HL_EDGE30, RoundedCornerShape(3.dp)))
        Text(
            "‹$term› står på linje $lineNo · $price kr" + if (more > 0) " og $more til" else "",
            color = ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 13.sp,
            modifier = Modifier.weight(1f).clickable(onClick = onGo),
        )
        Box(Modifier.height(30.dp).clip(RoundedCornerShape(15.dp)).background(ink.copy(alpha = .1f)).clickable(onClick = onClear).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
            Text("Fjern", color = ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
        }
    }
}

/** Pulsering (to ganger, 900 ms) for de markerte linjene: 0 → 1 → 0 → 1 → 0. */
@Composable
internal fun rememberHlPulse30(seq: Int): Float {
    val a = remember { Animatable(0f) }
    LaunchedEffect(seq) {
        repeat(2) { a.animateTo(1f, tween(225)); a.animateTo(0f, tween(225)) }
    }
    return a.value
}

/**
 * Bildet av kvitteringen med gule rektangler over linjene som matcher (bbox i prosent av bildet). Zoomer til første treff;
 * klyp og dra virker. Mangler bbox: tilbyr «Les kvitteringen på nytt».
 */
@Composable
internal fun ReceiptBoxes30(vm: AppViewModel, rc: TxReceipt, txId: Int, terms: List<String>) {
    val p = PaperPal.current
    LaunchedEffect(txId) { vm.loadBoxes30(txId) }
    val s = vm.p30
    val lines: List<RcLine30>? = s.boxes.takeIf { s.boxesFor == txId }
    val idx = s.hlIdx?.takeIf { it.isNotEmpty() }
    val hits = lines.orEmpty().filterIndexed { i, l -> l.box != null && (if (idx != null) i in idx else hlMatch30(l.text, terms) != null) }
    val isImg = rc.fileUrl != null && rc.mime?.contains("pdf") != true
    if (lines == null) return
    if (hits.isEmpty() || !isImg) {
        if (rc.id != null && lines.none { it.box != null }) Text(
            if (s.rereading) "Leser kvitteringen på nytt …" else "Les kvitteringen på nytt for å se hvor på bildet linjen står ›",
            color = p.mut, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp,
            modifier = Modifier.fillMaxWidth().clickable(enabled = !s.rereading) { vm.rereadReceipt30(rc.id, txId) }.padding(4.dp, 6.dp),
        )
        return
    }
    var bmp by remember(rc.fileUrl) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(rc.fileUrl) { rc.fileUrl?.let { bmp = vm.image(it) } }
    val b = bmp ?: return
    val first = hits.first().box!!
    // Zoom til første treff: skala 1,8 og flytt så midten av boksen havner midt i bildet.
    var scale by remember(txId) { mutableFloatStateOf(1.8f) }
    var off by remember(txId) { mutableStateOf(Offset.Unspecified) }
    val tf = rememberTransformableState { z, pan, _ ->
        scale = (scale * z).coerceIn(1f, 5f)
        off = (if (off == Offset.Unspecified) Offset.Zero else off) + pan
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(
            Modifier.fillMaxWidth().heightIn(max = 420.dp).aspectRatio(b.width.toFloat() / b.height.coerceAtLeast(1)).clip(RoundedCornerShape(10.dp))
                .background(Color(0xFFFBF8F1)).transformable(tf),
        ) {
            Box(
                Modifier.fillMaxSize().graphicsLayer {
                    scaleX = scale; scaleY = scale
                    val o = if (off == Offset.Unspecified) {
                        val cx = (first[0] + first[2] / 2f) / 100f * size.width
                        val cy = (first[1] + first[3] / 2f) / 100f * size.height
                        Offset((size.width / 2f - cx) * scale, (size.height / 2f - cy) * scale)
                    } else off
                    translationX = o.x; translationY = o.y
                },
            ) {
                Image(b.asImageBitmap(), "Kvitteringen", contentScale = ContentScale.FillBounds, modifier = Modifier.fillMaxSize())
                Canvas(Modifier.fillMaxSize()) {
                    hits.forEach { l ->
                        val x = l.box!!
                        val tl = Offset(x[0] / 100f * size.width, x[1] / 100f * size.height)
                        val sz = Size(x[2] / 100f * size.width, x[3] / 100f * size.height)
                        drawRoundRect(Color(0x59FFD23F), tl, sz, CornerRadius(4.dp.toPx()))
                        drawRoundRect(HL_EDGE30, tl, sz, CornerRadius(4.dp.toPx()), style = Stroke(2.dp.toPx() / scale))
                    }
                }
            }
        }
        Text("Klyp for å zoome · ${hits.size} treff markert på bildet", color = p.mut, fontFamily = PaperFonts.sans, fontSize = 11.5.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

package no.kristo.kalender.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import no.kristo.kalender.Ab42
import no.kristo.kalender.KEv
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red
import no.kristo.kalender.cap
import no.kristo.kalender.fd

/*
 * Prompt 42: Abonnementer i Kalender-appen (Android) – logo, merke TREKK / PRØVE / ÅRLIG og arket for et trekk.
 * Logoene hentes én gang (sti på serveren med token, ellers vanlig URL) og holdes i minnet. Uten logo: fargefelt med forbokstav.
 */

private object AbLogos42 {
    val images = mutableStateMapOf<String, ImageBitmap>()
    val asked = HashSet<String>()
}

@Composable
fun AbLogo42(vm: KalVm, e: KEv, size: Dp) {
    val c = vm.evCal(e)
    val url = e.ab?.logo.orEmpty().takeIf { it.startsWith("/") || it.startsWith("http") }.orEmpty()
    LaunchedEffect(url) {
        val s = vm.session
        if (url.isEmpty() || s == null || !AbLogos42.asked.add(url)) return@LaunchedEffect
        val b = no.kristo.kalender.Kal41.bytes(s, url) ?: return@LaunchedEffect
        val bmp = withContext(Dispatchers.Default) { runCatching { android.graphics.BitmapFactory.decodeByteArray(b, 0, b.size) }.getOrNull() } ?: return@LaunchedEffect
        AbLogos42.images[url] = bmp.asImageBitmap()
    }
    val img = AbLogos42.images[url]
    Box(Modifier.size(size).clip(RoundedCornerShape(size * 0.26f)).background(if (img != null) Color.White else c.col), contentAlignment = Alignment.Center) {
        if (img != null) Image(img, null, Modifier.size(size), contentScale = ContentScale.Fit)
        else Tx(Ab42.short(e).take(1).uppercase(), man((size.value * 0.6f).sp, FontWeight.ExtraBold, Color.White))
    }
}

@Composable
fun AbBadge42(vm: KalVm, e: KEv) {
    val k = LocalK.current
    val c = vm.evCal(e)
    val b = e.ab?.badge ?: "TREKK"
    Box(Modifier.clip(RoundedCornerShape(50)).background(if (b == "PRØVE") Red else c.col.copy(alpha = .133f)).padding(horizontal = 6.dp, vertical = 1.dp)) {
        Tx(b, mono(9.5.sp, if (b == "PRØVE") Color.White else c.fg(k), .06f).copy(fontWeight = FontWeight.Bold))
    }
}

/** Raden i en liste/agenda for et trekk: logo, navn + merke, konto · kalender og beløp høyrejustert (Plex Mono). */
@Composable
fun AbRowBody42(vm: KalVm, e: KEv, modifier: Modifier = Modifier) {
    val k = LocalK.current
    val c = vm.evCal(e)
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        AbLogo42(vm, e, 20.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Tx(Ab42.short(e), man(14.5.sp, FontWeight.Bold, k.ink), Modifier.weight(1f, fill = false))
                AbBadge42(vm, e)
            }
            val x = e.ab
            Tx(listOf(x?.cancelled?.takeIf { it.isNotEmpty() } ?: x?.account.orEmpty(), c.n).filter { it.isNotEmpty() }.joinToString(" · "), man(12.5.sp, FontWeight.Medium, k.mut))
        }
        Tx(Ab42.amountText(e), mono(13.sp, k.ink))
    }
}

@Composable
private fun AbInfo42(label: String, value: String) {
    val k = LocalK.current
    Row(
        Modifier.fillMaxWidth().drawBehind { drawLine(k.line2, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }.padding(vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Tx(label, man(14.sp, FontWeight.Medium, k.mut))
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) { Tx(value, man(14.sp, FontWeight.Bold, k.ink).copy(textAlign = TextAlign.End), maxLines = 2) }
    }
}

/** Arket for et trekk: logo, beløp, konto, intervall, neste trekk, «Åpne i Finans ›» og «Si opp …». Ikke redigerbart her. */
@Composable
fun AbDetail42(vm: KalVm, e: KEv) {
    val k = LocalK.current
    val x = e.ab ?: return
    val ctx = vm.getApplication<android.app.Application>()
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AbLogo42(vm, e, 44.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Tx(if (e.kind == "trial") e.t else Ab42.short(e), news(26.sp, k.ink, 29.sp), maxLines = 3)
                Row { AbBadge42(vm, e) }
            }
        }
        val amt = Ab42.amountText(e)
        if (amt.isNotEmpty()) Tx(amt, mono(24.sp, k.ink))
        Column(Modifier.drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }) {
            AbInfo42(if (e.kind == "trial") "Prøveperioden slutter" else "Trekkdato", cap(fd(e.d)))
            if (x.account.isNotEmpty()) AbInfo42("Konto", x.account)
            AbInfo42("Intervall", Ab42.intervalText(e))
            val nx = runCatching { java.time.LocalDate.parse(x.next) }.getOrNull()
            if (nx != null && nx != e.d) AbInfo42("Neste trekk", cap(fd(nx)))
            if (x.cancelled.isNotEmpty()) AbInfo42("Status", x.cancelled)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            InkPill("Åpne i Finans ›", { Ab42.openFinans(ctx, e, vm.session?.server) })
            if (x.cancelUrl.isNotEmpty() && x.cancelled.isEmpty()) LinePill("Si opp …", { Ab42.openUrl(ctx, x.cancelUrl) })
        }
        Tx("Endres i Finans → Abonnementer", man(12.5.sp, FontWeight.Medium, k.mut))
    }
}

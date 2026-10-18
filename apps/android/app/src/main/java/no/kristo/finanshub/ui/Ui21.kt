package no.kristo.finanshub.ui

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.withTimeoutOrNull
import no.kristo.finanshub.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/*
 * Prompt 21 (native Android): utvidbar avgang med stoppliste, hold-og-dra for kort, felles pakkelogo med fraktmerke.
 */

/* ---------------- Avganger med holdeplasser ---------------- */

private val depHm = DateTimeFormatter.ofPattern("HH:mm")

/** «19:04» fra ISO-tid; tekst som allerede er et klokkeslett, brukes som den er. */
internal fun depClock(t: String?): String {
    if (t.isNullOrBlank()) return ""
    if (Regex("^\\d{1,2}:\\d{2}$").matches(t)) return t
    return runCatching { Instant.parse(t).atZone(ZoneId.systemDefault()).format(depHm) }
        .recoverCatching { java.time.OffsetDateTime.parse(t).atZoneSameInstant(ZoneId.systemDefault()).format(depHm) }
        .getOrDefault("")
}

/** Transportmåten på norsk (serveren sender «Trikk», eldre servere «tram»). */
internal fun depModeName(m: String?): String? = when (m?.lowercase()) {
    null, "" -> null
    "tram", "trikk" -> "Trikk"; "bus", "coach", "buss" -> "Buss"; "metro", "t-bane" -> "T-bane"; "rail", "tog" -> "Tog"; "water", "båt" -> "Båt"
    else -> m
}

/** «i rute» / «2 min forsinket»: serverens tekst, ellers regnet ut fra forsinkelsen. */
internal fun depStatus(d: Dep): String? {
    d.status?.let { return it }
    val delay = d.delayMin ?: run {
        val a = runCatching { Instant.parse(d.aimed!!) }.getOrNull(); val e = runCatching { Instant.parse(d.expected!!) }.getOrNull()
        if (a != null && e != null) Math.round((e.epochSecond - a.epochSecond) / 60.0).toInt() else null
    } ?: return if (d.realtime) "i rute" else null
    return if (delay <= 0) "i rute" else "$delay min forsinket"
}

private fun ruterPlanner(from: String?, to: String?): String {
    fun enc(s: String) = java.net.URLEncoder.encode(s, "UTF-8").replace("+", "%20")
    val q = listOfNotNull(from?.takeIf { it.isNotBlank() }?.let { "from=" + enc(it) }, to?.takeIf { it.isNotBlank() }?.let { "to=" + enc(it) })
    return "https://ruter.no/reiseplanlegger/" + if (q.isEmpty()) "" else "?" + q.joinToString("&")
}

/**
 * Én avgang i Avganger: linjemerke, mål og «Trikk · plattform B · i rute», minutter og klokkeslett til høyre.
 * Trykk utvider raden med stopplisten (linje i linjefargen, fylt første sirkel, hule ellers, første og siste i fet)
 * og «Åpne i Ruter ›». Bare én rad er åpen om gangen; høyden animeres (200 ms).
 */
@Composable
internal fun DepRow21(d: Dep, from: String?, open: Boolean, top: Boolean, onToggle: () -> Unit) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val lineColor = Color(d.color ?: ruterModeColor(d.mode, d.line))
    val status = depStatus(d)
    val late = (d.delayMin ?: 0) > 0 || status?.contains("forsinket") == true
    Column(Modifier.fillMaxWidth().animateContentSize(tween(200, easing = FastOutSlowInEasing))) {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().clickable(onClickLabel = if (open) "Skjul stopp" else "Vis stopp") { Haptics.select(); onToggle() }.padding(14.dp, 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.widthIn(min = 36.dp).height(28.dp).clip(RoundedCornerShape(7.dp)).background(lineColor).padding(horizontal = 6.dp), contentAlignment = Alignment.Center) {
                Text(d.line, color = Color(d.textColor ?: 0xFF1B1A17), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, maxLines = 1)
            }
            Column(Modifier.weight(1f)) {
                Text(d.to, color = if (d.cancelled) p.mut else p.ink, fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                val parts = listOfNotNull(depModeName(d.mode), d.platform?.takeIf { it.isNotBlank() && it != "–" }?.let { "plattform $it" }, if (d.cancelled) "innstilt" else status)
                if (parts.isNotEmpty()) Text(parts.joinToString(" · "), color = if (late || d.cancelled) p.lab else p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                d.situation?.let { Text("⚠ $it", color = p.lab, fontSize = 12.sp, maxLines = if (open) 4 else 1, overflow = TextOverflow.Ellipsis) }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    if (d.cancelled) "Innstilt" else d.minutes?.let { if (it <= 0) "nå" else "$it min" } ?: depClock(d.expected ?: d.aimed),
                    color = if (d.cancelled) p.lab else p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 26.sp, maxLines = 1,
                    textDecoration = if (d.cancelled) TextDecoration.LineThrough else null,
                )
                depClock(d.expected ?: d.aimed).takeIf { it.isNotBlank() }?.let { Text(it, color = p.mut, fontSize = 12.sp) }
            }
        }
        if (open) Column(Modifier.fillMaxWidth().padding(start = 62.dp, end = 14.dp, bottom = 14.dp)) {
            if (d.stops.isEmpty()) Text("Stoppene på turen kommer når serveren har dem.", color = p.mut, fontSize = 12.5.sp, modifier = Modifier.padding(vertical = 4.dp))
            else StopList(d.stops, lineColor)
            Text("Åpne i Ruter ›", color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, textDecoration = TextDecoration.Underline,
                modifier = Modifier.padding(top = 8.dp).clip(RoundedCornerShape(6.dp)).clickable { openLink(ctx, d.ruterUrl ?: ruterPlanner(from, d.to)) }.padding(vertical = 4.dp))
        }
    }
}

/** Stopplisten. Mer enn 6 stopp: de to første, «· · · N stopp» (trykk viser alle) og de to siste. */
@Composable
private fun StopList(stops: List<DepStop>, lineColor: Color) {
    val p = PaperPal.current
    var all by remember(stops) { mutableStateOf(false) }
    val n = stops.size
    val collapsed = n > 6 && !all
    val shown: List<Pair<Int, DepStop>?> = if (!collapsed) stops.mapIndexed { i, s -> i to s }
        else listOf(0 to stops[0], 1 to stops[1], null, n - 2 to stops[n - 2], n - 1 to stops[n - 1])
    shown.forEach { e ->
        if (e == null) {
            Row(Modifier.fillMaxWidth().heightIn(min = 30.dp).clickable { all = true }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.width(10.dp).height(30.dp), contentAlignment = Alignment.Center) { Box(Modifier.width(2.dp).fillMaxHeight().background(lineColor)) }
                Text("· · · ${n - 4} stopp", color = p.mut, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
            return@forEach
        }
        val (i, s) = e
        val first = i == 0
        val last = i == n - 1
        Row(Modifier.fillMaxWidth().heightIn(min = 30.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.width(10.dp).height(30.dp), contentAlignment = Alignment.Center) {
                Column(Modifier.fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.width(2.dp).weight(1f).background(if (first) Color.Transparent else lineColor))
                    Box(Modifier.size(9.dp).clip(CircleShape).background(if (first) lineColor else p.card).border(2.dp, lineColor, CircleShape))
                    Box(Modifier.width(2.dp).weight(1f).background(if (last) Color.Transparent else lineColor))
                }
            }
            Text(s.name, color = p.ink, fontSize = 13.5.sp, fontWeight = if (first || last) FontWeight.Bold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text(depClock(s.time ?: s.expected ?: s.aimed), color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        }
    }
}

/* ---------------- Pakkekort med logo ---------------- */

/**
 * Felles pakkelogo (52×52, radius 14, hvit flate, 1 dp kant): butikkens logo først, så fraktselskapets, så bokstav i
 * selskapets farge. Når butikken vises, står fraktselskapet som liten rund merkelapp (18×18, hvit kant) nede til høyre.
 */
@Composable
internal fun PackageLogo(vm: AppViewModel, s: Shipment, size: Int = 52) {
    val p = PaperPal.current
    val shape = RoundedCornerShape((size * 14f / 52f).dp)
    var shopBmp by remember(s.id, s.shopDomain, s.logoId) { mutableStateOf<android.graphics.Bitmap?>(null) }
    var carrierBmp by remember(s.id, s.carrier) { mutableStateOf<android.graphics.Bitmap?>(null) }
    LaunchedEffect(s.id, s.shopDomain, s.logoId, s.carrier) {
        if (s.hasShopLogo) shopBmp = runCatching { vm.logoFor(s.shopDomain, s.shop.ifBlank { s.logoId }) }.getOrNull()
        // Prompt 22: fraktselskapet bare fra manuelt kontrollerte filer i logobiblioteket, aldri et tilfeldig favicon.
        carrierBmp = runCatching { vm.carrierRegLogo(s.carrierDomain ?: CARRIER_DOMAINS[s.carrier], s.carrierName) }.getOrNull()
    }
    val main = shopBmp
    Box(Modifier.size((size + 4).dp)) {
        Box(Modifier.size(size.dp).clip(shape).background(Color.White).border(1.dp, p.line, shape), contentAlignment = Alignment.Center) {
            val img = main ?: carrierBmp
            if (img != null) androidx.compose.foundation.Image(img.asImageBitmap(), null, contentScale = androidx.compose.ui.layout.ContentScale.Fit,
                modifier = Modifier.fillMaxSize().padding((size * .14f).dp))
            else CarrierBadge(s.carrierIni, s.carrierColor, s.carrierFg, size, s.carrier)
        }
        // Liten fraktmerkelapp når butikkens logo vises.
        if (main != null) Box(
            Modifier.align(Alignment.BottomEnd).size(18.dp).clip(CircleShape).background(Color.White).border(1.5.dp, Color.White, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            val cb = carrierBmp
            if (cb != null) androidx.compose.foundation.Image(cb.asImageBitmap(), null, contentScale = androidx.compose.ui.layout.ContentScale.Fit, modifier = Modifier.fillMaxSize().padding(2.dp).clip(CircleShape))
            else Box(Modifier.fillMaxSize().clip(CircleShape).background(Color(s.carrierColor)), contentAlignment = Alignment.Center) {
                Text(s.carrierIni.take(1), color = Color(s.carrierFg), fontSize = 9.sp, fontWeight = FontWeight.Black)
            }
        }
    }
}


/** «+12 pakker ›» (antall minus denne), «›» når det bare er én. */
internal fun morePackagesLabel(vm: AppViewModel, first: Shipment?): String {
    val more = first?.moreCount
        ?: vm.mobileHome?.packagesTotal?.let { it - 1 }
        ?: vm.tracking?.items?.count { it.active }?.let { it - 1 }
        ?: ((vm.homePackages?.size ?: 1) - 1)
    return when { more <= 0 -> "›"; more == 1 -> "+1 pakke ›"; else -> "+$more pakker ›" }
}

/* ---------------- Hold inne og dra ---------------- */

/**
 * Langt trykk (500 ms) hvor som helst på kortet, også over lenker og knapper. Flyttes fingeren mer enn 8 px før det,
 * avbrytes trykket og listen scroller som vanlig. Etter et langt trykk spises resten av berøringen (Initial-passet),
 * så klikket ved slipp aldri åpner siden. Fingeren kan dra kortet med en gang: onDrag får pekerens y i rotkoordinater
 * (toRootY regner om fra kortets egne koordinater, med flytting og skalering).
 */
internal fun Modifier.holdDrag(
    enabled: Boolean,
    onLong: () -> Unit,
    onDrag: (rootY: Float) -> Unit,
    onEnd: () -> Unit,
    toRootY: (androidx.compose.ui.geometry.Offset) -> Float,
): Modifier = if (!enabled) this else this.pointerInput(Unit) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        val slop = 8.dp.toPx()
        var moved = false
        val released = withTimeoutOrNull(500L) {
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Initial)
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: return@withTimeoutOrNull true
                if (!ch.pressed) return@withTimeoutOrNull true
                if ((ch.position - down.position).getDistance() > slop) { moved = true; return@withTimeoutOrNull true }
            }
            @Suppress("UNREACHABLE_CODE") true
        }
        if (released != null || moved) return@awaitEachGesture
        onLong()
        try {
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Initial)
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                // Alt etter det lange trykket spises: ingen klikk og ingen scrolling mens kortet dras.
                ev.changes.forEach { it.consume() }
                if (!ch.pressed) break
                if (ch.positionChange() != androidx.compose.ui.geometry.Offset.Zero) onDrag(toRootY(ch.position))
            }
        } finally { onEnd() }
    }
}

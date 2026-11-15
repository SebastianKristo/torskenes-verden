@file:JvmName("DomeneAvganger")

package no.kristo.finanshub.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/*
 * Avganger (Ruter): kode som lå i blandingsfilene (Ui21.kt, Ui41.kt, Ui46.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
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

/* ======================= Min reise ======================= */

private fun modeColor41(l: Leg41): Color = when (l.mode) {
    "foot", "walk", "gå" -> Color.Transparent
    else -> Color(ruterModeColor(l.mode, l.line ?: ""))
}

/** Etappe-stripen: «Gå 6 › Trikk 19 · 9 min › Gå 2 › 45». */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LegStrip41(legs: List<Leg41>) {
    val p = PaperPal.current
    FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        legs.forEachIndexed { i, l ->
            if (i > 0) Text("›", color = p.mut, fontSize = 12.sp, modifier = Modifier.align(Alignment.CenterVertically))
            val walk = modeColor41(l) == Color.Transparent
            Box(Modifier.height(22.dp).clip(RoundedCornerShape(6.dp)).background(if (walk) p.bg else modeColor41(l)).padding(horizontal = 6.dp), contentAlignment = Alignment.Center) {
                Text(legLabel41(l) + if (l.delayMin >= 3) " +${l.delayMin}" else "", color = if (walk) p.ink else Color.White, fontSize = 11.5.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
        }
    }
}

/**
 * «MIN REISE · SEBASTIAN» (Ruter-siden, over transportfilteret) og «MIN REISE · FORLOT SKOLEN HH:MM» (Hjem, sveip bort).
 * Vises bare når serveren har forhåndsruter for brukeren.
 */
@Composable
internal fun MinReise41(vm: AppViewModel, home: Boolean) {
    val s = vm.p41
    LaunchedEffect(home) { vm.initP41(); if (!home) vm.loadTrip41(force = true) }
    if (!home) GjentaMensSynlig { while (true) { delay(30_000); vm.loadTrip41() } }
    val t = s.trip ?: return
    if (t.options.isEmpty()) return
    if (home) {
        if (!vm.tripOnHome41()) return
        SwipeDismiss39(enabled = true, radius = 22.dp, idle = "Sveip for å skjule", armed = "Slipp for å skjule", done = "Min reise skjult",
            sub = "Kommer tilbake neste gang du forlater skolen", onGone = { vm.hideTrip41() }, onTap = { vm.openRuter() }) { TripCard41(vm, t, true) }
    } else TripCard41(vm, t, false)
}

@Composable
private fun TripCard41(vm: AppViewModel, t: Trip41, home: Boolean) {
    val p = PaperPal.current
    val s = vm.p41
    val first = firstName37(vm.displayName).uppercase()
    // Prompt 46 (claude-code-ruter-innstillinger-i-wiggle.md): innstillingene vises bare i redigering (hold inne / «Rediger stopp»).
    val edit46 = !home && vm.stopEdit
    Column(Modifier.fillMaxWidth().wiggle46(edit46).clip(RoundedCornerShape(22.dp)).background(p.card).then(if (home) Modifier.clickable { vm.openRuter() } else Modifier.longPressEdit(!vm.stopEdit) { Haptics.tap(); vm.stopEdit = true }).padding(16.dp, 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // Prompt 42 (claude-code-ruter-snu-knapp.md): raden er sentrert loddrett mot etikett + tittel, med 10 dp mellomrom.
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                PLabel(if (home) "Min reise · forlot skolen ${hm41(s.journey?.leftAt)}" else "Min reise · $first")
                PSerif("${t.from} → ${t.to}", 21.sp, p.ink, maxLines = 1)
            }
            // «⇄ Snu» som i designet: 36 dp høy pille, 13 dp sidemarg, 1 dp kant, Manrope 700 12,5; treffflate minst 48 dp.
            if (!home) Box(
                Modifier.minimumInteractiveComponentSize().clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Snu retning") { Haptics.select(); vm.flipTrip41() },
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp)).padding(horizontal = 13.dp), contentAlignment = Alignment.Center) {
                    Text("⇄ Snu", color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1, softWrap = false)
                }
            }
        }
        t.alert?.let { a ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color(0x1FC0392B)).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(a.text, color = Color(0xFFC0392B), fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
                a.body?.let { Text(it, color = p.ink, fontSize = 13.sp, lineHeight = 18.sp) }
                val walk = listOfNotNull(a.walkMin?.let { "Gå $it min" }, a.km?.let { String.format(java.util.Locale("nb", "NO"), "%.1f km", it) }).joinToString(" · ")
                if (walk.isNotBlank() || a.catches != null) Text(listOfNotNull(walk.ifBlank { null }, a.catches?.let { "rekker $it" }, a.homeAt?.let { "hjemme ${hm41(it).ifBlank { it }}" }).joinToString(" · "),
                    color = p.ink, fontSize = 13.sp)
            }
        }
        // Prompt 45 (claude-code-ruter-anbefalt-antall.md): nøyaktig N rader (1 · 2 · 3, standard 2), færre hvis det finnes færre.
        LaunchedEffect(Unit) { vm.loadRecoCount45() }
        val opts = t.options.take(vm.p45.recoCount)
        opts.forEachIndexed { i, o ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            val open = s.tripOpen == i && !home
            Column(Modifier.fillMaxWidth().then(if (!home) Modifier.clickable { s.tripOpen = if (open) null else i } else Modifier), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PSerif(hm41(o.dep).ifBlank { "–" }, 24.sp, maxLines = 1)
                    Text("→ ${hm41(o.arr)}" + (o.minutes?.let { " · $it min" } ?: ""), color = p.mut, fontSize = 13.sp, modifier = Modifier.weight(1f).padding(bottom = 3.dp))
                    if (o.preferred) Text("Foretrukket", color = p.pos, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    o.badges.filter { it != "Foretrukket" }.take(2).forEach { b -> Text(b, color = Color(0xFFC0392B), fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                }
                LegStrip41(o.legs)
                if (open) Column(Modifier.fillMaxWidth().padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    o.legs.forEach { l ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(hm41(l.dep), color = p.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp, modifier = Modifier.width(44.dp))
                            val walk = modeColor41(l) == Color.Transparent
                            Text(
                                if (walk) "Gå ${l.walkMin ?: ""} min".replace("  ", " ") + (l.meters?.let { " · $it m" } ?: "") + (l.to?.let { " til $it" } ?: "")
                                else "${legLabel41(l)} fra ${l.from ?: "–"} til ${l.to ?: "–"}" + if (l.delayMin >= 1) " · +${l.delayMin} min" else "",
                                color = if (l.delayMin >= 3) Color(0xFFC0392B) else p.ink, fontSize = 13.sp, modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }
        }
        if (!home && !edit46) TripLocNote46(vm)
        if (!home) AnimatedVisibility(edit46, enter = androidx.compose.animation.expandVertically(tween(300)) + fadeIn(tween(300)),
            exit = androidx.compose.animation.shrinkVertically(tween(300)) + fadeOut(tween(200))) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                PLabel("Innstillinger for kortet", p.mut)
                School50(vm) // prompt 50: «SKOLE · FRA FAMILIE › STEDER» (bare visning, «Endre i Steder ›»); eldre server: Zones41
                PLabel("Antall anbefalte reiser", p.mut)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(1, 2, 3).forEach { n -> Pill41("$n", vm.p45.recoCount == n) { vm.setRecoCount45(n) } }
                }
                PLabel("På Hjem når du forlater skolen", p.mut)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("over" to "Over Ruter-kortet", "instead" to "I stedet", "off" to "Av").forEach { (k, n) -> Pill41(n, s.homeCard == k) { vm.setHomeCard41(k) } }
                }
            }
        }
    }
}

@Composable
internal fun TripToast41(vm: AppViewModel) {
    val s = vm.p41
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        AnimatedVisibility(s.rtToast, Modifier.navigationBarsPadding().padding(bottom = 100.dp), enter = fadeIn(tween(300)) + slideInVertically(tween(300)) { it / 2 }, exit = fadeOut(tween(200))) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(18.dp)).background(Color(0xFF1B1A17)).padding(start = 16.dp, end = 10.dp, top = 10.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Min reise skjult til neste gang du forlater skolen", color = Color(0xFFF3EFE6), fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
                Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(Color(0xFFF3EFE6)).clickable(role = Role.Button) { vm.undoHideTrip41() }.padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center) { Text("Angre", color = Color(0xFF1B1A17), fontWeight = FontWeight.Bold, fontSize = 13.sp) }
            }
        }
    }
}

/* ======================= Ruter: posisjonsvarsel og vugging ======================= */

/** I normal visning: bare en liten linje når posisjon mangler (skolesonene virker ikke uten den). */
@Composable
internal fun TripLocNote46(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val bg = android.os.Build.VERSION.SDK_INT < 29 ||
        ctx.checkSelfPermission(android.Manifest.permission.ACCESS_BACKGROUND_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
    if (bg) return
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button) {
        runCatching { ctx.startActivity(android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:" + ctx.packageName)).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("Skolesonene trenger posisjon «Alltid».", color = p.mut, fontSize = 12.5.sp, modifier = Modifier.weight(1f))
        Text("Slå på ›", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
    }
}

/** Kortet vugger (±0,6°) i redigering, som de andre wiggle-kortene. Bare transform. */
internal fun Modifier.wiggle46(on: Boolean): Modifier = if (!on) this else composed {
    val r = rememberInfiniteTransition(label = "w46").animateFloat(-.6f, .6f, infiniteRepeatable(tween(300), RepeatMode.Reverse), label = "w")
    graphicsLayer { rotationZ = r.value }
}

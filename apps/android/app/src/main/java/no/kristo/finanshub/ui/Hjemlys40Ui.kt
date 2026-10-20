package no.kristo.finanshub.ui

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import java.time.Instant
import java.time.ZoneId

/*
 * Prompt 40 (ANDROID40) – Hjemlys-flyten (tillegget i kontrakten: alle tre, 1a + 1b + 1c, fasit Hjemme trygt Varianter.dc.html):
 *  - 1a «Rolig og papir» (dag): kart med tegnet rute hjem (ingen kartbibliotek), «Fra … · km», reisemåter med ankomsttid,
 *    mottakere og «Start · hjemme ca. …». Aktiv økt: stor tid, fremdrift, Følger med / Deler nå / Hvis du er sen, + 10 min, Avslutt.
 *  - 1b «Glimt foreslår»: forslaget som kort i appen og som varsel («Ja, start» / «Ikke nå», Hjemlys40Notify.suggest),
 *    Glimt sjekker inn («Alt OK?») og familiens logg (GET /api/hjemlys/:id/log).
 *  - 1c «Nattmodus» (kl. 21–06 eller mørkt papir): mørk startside med ventetid 5/10/15/30 og hva som deles, nedtellingsring,
 *    og rød alarmskjerm hos mottakeren («… er 15 min forsinket», Ring / Åpne kart / Ring 112).
 *  - Felles: Hjem-widgeten «Start for meg» (widget/Hjemlys40Widget.kt), Live Update (Hjemlys40.kt) og Familie-/Hjem-kortet.
 */

private val OSLO_UI40: ZoneId = ZoneId.of("Europe/Oslo")
private val NIGHT_BG = Color(0xFF0E1420)
private val NIGHT_CARD = Color(0xFF1A2232)
private val NIGHT_INK = Color(0xFFF3EFE6)
private val NIGHT_MUT = Color(0xFF9AA3B5)
private val HL_GREEN = Color(0xFF2F9E5B)
private val HL_RED = Color(0xFFD9412E)
private val HL_GOLD = Color(0xFFF2A93B)

private fun isNight40(): Boolean {
    val h = java.time.ZonedDateTime.now(OSLO_UI40).hour
    return h >= 21 || h < 6 || Tone.paperDark
}

private fun clock40(ms: Long): String = Instant.ofEpochMilli(ms).atZone(OSLO_UI40).let { "%02d.%02d".format(it.hour, it.minute) }
private fun etaMs40(iso: String?): Long? = iso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

private fun names40(l: List<String>): String = l.map { firstName37(it) }.filter { it.isNotBlank() }.let {
    when (it.size) { 0 -> "Alle i husstanden"; 1 -> it[0]; else -> it.dropLast(1).joinToString(", ") + " og " + it.last() }
}

/** Fullskjerm: start (1a dag / 1c natt), aktiv økt, Glimt og logg (1b), eller mottakers visning når noen er sen. */
@Composable
internal fun HjemlysPage40(vm: AppViewModel) {
    val s = vm.p40
    BackHandler { s.hlSheet = false; s.hlLateFor = null }
    LaunchedEffect(Unit) { vm.loadHjemlys40(force = true); vm.loadHlRoute40(); if (vm.family == null) vm.loadFamily() }
    val mine = s.hl?.mine?.takeIf { it.state != "home" && it.state != "ended" }
    LaunchedEffect(mine?.id) { mine?.id?.let { vm.loadHlLog40(it) } }
    val night = isNight40()
    val late = s.hlLateFor?.let { id -> s.hl?.household?.firstOrNull { it.userId == id } }
    val bg = if (late != null && night) Color(0xFF5A1010) else if (night) NIGHT_BG else PaperPal.current.bg
    Box(Modifier.fillMaxSize().background(bg).clickable(remember { MutableInteractionSource() }, null) {}) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().padding(18.dp, 10.dp, 18.dp, 30.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val ink = if (night || late != null) NIGHT_INK else PaperPal.current.ink
                Text(if (mine != null || late != null) "‹ Tilbake" else "Avbryt", color = ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
                    modifier = Modifier.clip(CircleShape).clickable(role = Role.Button) { s.hlSheet = false; s.hlLateFor = null }.padding(8.dp, 6.dp))
                Spacer(Modifier.weight(1f))
                Text("Hjemlys", color = ink, fontFamily = PaperFonts.serif, fontSize = 20.sp)
                Spacer(Modifier.weight(1f))
                Spacer(Modifier.width(60.dp))
            }
            when {
                late != null -> LateView40(vm, late, night)
                mine != null -> ActiveView40(vm, mine, night)
                night -> StartNight40(vm)
                else -> StartDay40(vm)
            }
        }
    }
}

/* ---------- Start ---------- */

@Composable
private fun rememberStart40(vm: AppViewModel): Pair<() -> Unit, (Long, Int) -> Unit> {
    val ctx = LocalContext.current
    var pend by remember { mutableStateOf<Pair<Long, Int>?>(null) }
    val perm = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { _: Map<String, Boolean> ->
        pend?.let { (e, w) -> vm.startHjemlys40(e, w) }; pend = null
    }
    val go: (Long, Int) -> Unit = { e, w ->
        val need = mutableListOf<String>()
        if (!Hjemlys40Service.hasLocation(ctx)) { need += Manifest.permission.ACCESS_FINE_LOCATION; need += Manifest.permission.ACCESS_COARSE_LOCATION }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) need += Manifest.permission.POST_NOTIFICATIONS
        if (need.isEmpty()) vm.startHjemlys40(e, w) else { pend = e to w; perm.launch(need.toTypedArray()) }
    }
    return ({ }) to go
}

/** Kartet med en enkel tegnet rute (fra geometrien når serveren sender den, ellers en myk kurve) og ⌂ hjemme. */
@Composable
private fun RouteMap40(route: HlRoute40?, night: Boolean, progress: Float? = null, height: Dp = 190.dp) {
    val bgc = if (night) Color(0xFF151C2A) else Color(0xFFE9E5DC)
    val street = if (night) Color(0xFF232C3E) else Color(0xFFF7F4EE)
    Box(Modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(22.dp)).background(bgc)) {
        Canvas(Modifier.matchParentSize()) {
            val w = size.width; val h = size.height
            // Gater (rutenett, litt skrått).
            for (i in 0..7) drawLine(street, Offset(-20f + i * w / 6f, 0f), Offset(i * w / 6f - w * .18f, h), 9.dp.toPx())
            for (i in 0..4) drawLine(street, Offset(0f, i * h / 4f + 12f), Offset(w, i * h / 4f - h * .12f), 7.dp.toPx())
            val pts: List<Offset> = route?.geometry?.takeIf { it.size >= 2 }?.let { g ->
                val la = g.map { it.first }; val lo = g.map { it.second }
                val minLa = la.min(); val maxLa = la.max(); val minLo = lo.min(); val maxLo = lo.max()
                val sx = (maxLo - minLo).takeIf { it > 0 } ?: 1.0; val sy = (maxLa - minLa).takeIf { it > 0 } ?: 1.0
                g.map { (a, o) -> Offset((w * .12f + (o - minLo) / sx * w * .76f).toFloat(), (h * .86f - (a - minLa) / sy * h * .72f).toFloat()) }
            } ?: listOf(Offset(w * .14f, h * .8f), Offset(w * .38f, h * .62f), Offset(w * .52f, h * .48f), Offset(w * .7f, h * .36f), Offset(w * .86f, h * .2f))
            val path = Path().apply {
                moveTo(pts[0].x, pts[0].y)
                for (i in 1 until pts.size) { val a = pts[i - 1]; val b = pts[i]; quadraticBezierTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2) }
                lineTo(pts.last().x, pts.last().y)
            }
            drawPath(path, Color.White.copy(alpha = if (night) .25f else .9f), style = Stroke(9.dp.toPx(), cap = StrokeCap.Round))
            drawPath(path, HL_GREEN, style = Stroke(4.dp.toPx(), cap = StrokeCap.Round, pathEffect = if (progress == null) PathEffect.dashPathEffect(floatArrayOf(14f, 10f)) else null))
            drawCircle(Color.White, 8.dp.toPx(), pts.first()); drawCircle(Color(0xFF2B5D8A), 5.dp.toPx(), pts.first())
            // Hvor du er nå (aktiv økt).
            progress?.let { pr ->
                val i = ((pts.size - 1) * pr.coerceIn(0f, 1f)).toInt().coerceIn(0, pts.size - 1)
                drawCircle(HL_GOLD.copy(alpha = .35f), 14.dp.toPx(), pts[i]); drawCircle(HL_GOLD, 7.dp.toPx(), pts[i])
            }
            drawCircle(Color(0xFF1B1A17), 11.dp.toPx(), pts.last())
        }
        Text("KART", color = if (night) NIGHT_MUT else Color(0xFF7A7468), fontFamily = PaperFonts.mono, fontSize = 10.sp, modifier = Modifier.align(Alignment.TopEnd).padding(12.dp))
    }
}

private fun modeLabel40(m: String): String = when (m) { "gå" -> "Gå"; "sykkel" -> "Sykkel"; "kollektiv" -> "Kollektiv"; else -> m.replaceFirstChar { it.uppercase() } }

/** 1a: dagtid. */
@Composable
private fun StartDay40(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p40
    val ctx = LocalContext.current
    val (_, go) = rememberStart40(vm)
    val r = s.hlRoute
    val opt = r?.options?.firstOrNull { it.mode == s.hlMode } ?: r?.options?.firstOrNull()
    var custom by remember { mutableStateOf<Long?>(null) }
    var wait by remember { mutableStateOf(15) }
    val eta = custom ?: etaMs40(opt?.eta) ?: opt?.minutes?.let { System.currentTimeMillis() + it * 60_000L } ?: etaMs40(s.hlSuggest?.eta) ?: (System.currentTimeMillis() + 30 * 60_000L)
    Suggest40(vm, false)
    RouteMap40(r, false)
    PLabel("SI FRA NÅR JEG ER HJEMME", p.mut)
    if (r?.fromName != null) Text("Fra ${r.fromName}" + (r.km?.let { " · " + String.format(java.util.Locale("nb", "NO"), "%.1f km", it) } ?: ""), color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
    if (r != null && r.options.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card)) {
        r.options.forEachIndexed { i, o ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            val on = o.mode == opt?.mode && custom == null
            Row(Modifier.fillMaxWidth().clickable(role = Role.RadioButton) { s.hlMode = o.mode; custom = null }.padding(14.dp, 12.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(o.label.ifBlank { modeLabel40(o.mode) }, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
                    if (o.legs.isNotEmpty()) Text(o.legs.joinToString(" · "), color = p.mut, fontSize = 12.sp)
                }
                Text("ca. " + (etaMs40(o.eta) ?: o.minutes?.let { System.currentTimeMillis() + it * 60_000L })?.let { clock40(it) }.orEmpty(), color = p.mut, fontSize = 13.sp)
                if (on) Text("✓", color = p.pos, fontWeight = FontWeight.Bold)
            }
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(if (custom != null) "Egen tid · ${clock40(eta)}" else "Annen tid?", color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp,
            modifier = Modifier.clip(CircleShape).clickable {
                val z = Instant.ofEpochMilli(eta).atZone(OSLO_UI40)
                android.app.TimePickerDialog(ctx, { _, hh, mm ->
                    var d = java.time.ZonedDateTime.now(OSLO_UI40).withHour(hh).withMinute(mm).withSecond(0)
                    if (d.toInstant().toEpochMilli() < System.currentTimeMillis()) d = d.plusDays(1)
                    custom = d.toInstant().toEpochMilli()
                }, z.hour, z.minute, true).show()
            }.padding(6.dp))
    }
    PLabel("FÅR BESKJED", p.mut)
    Text(names40(recipients40(vm)), color = p.ink, fontSize = 14.sp)
    PLabel("HVIS DU IKKE SVARER PÅ «ALT OK?»", p.mut)
    Seg40(listOf("5" to "5 min", "10" to "10 min", "15" to "15 min", "30" to "30 min"), "$wait") { wait = it.toInt() }
    Text("Tiden oppdateres etter hvor du er. Deler ingenting før du er sen, eller hvis du stopper svaret.", color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
    PButton(if (s.hlBusy) "Starter …" else "Start · hjemme ca. ${clock40(eta)}", Modifier.fillMaxWidth(), kind = "lab", height = 52.dp) { go(eta, wait) }
}

private fun recipients40(vm: AppViewModel): List<String> =
    vm.p40.hlSuggest?.recipients?.takeIf { it.isNotEmpty() } ?: (vm.family?.members ?: emptyList()).filter { it.userId != vm.family?.me?.userId }.map { it.name }

/** 1c: natt / mørkt tema. */
@Composable
private fun StartNight40(vm: AppViewModel) {
    val s = vm.p40
    val (_, go) = rememberStart40(vm)
    val opt = s.hlRoute?.options?.firstOrNull { it.mode == s.hlMode } ?: s.hlRoute?.options?.firstOrNull()
    var wait by remember { mutableStateOf(10) }
    var add by remember { mutableStateOf(0) }
    val base = etaMs40(opt?.eta) ?: etaMs40(s.hlSuggest?.eta) ?: (System.currentTimeMillis() + 25 * 60_000L)
    val eta = base + add * 60_000L
    Suggest40(vm, true)
    Column(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        HlDot40("onTheWay", 64.dp)
        Text("Si fra når jeg er hjemme", color = NIGHT_INK, fontFamily = PaperFonts.serif, fontSize = 28.sp, textAlign = TextAlign.Center)
        Text("Hjem · ca. ${clock40(eta)}" + (opt?.legs?.takeIf { it.isNotEmpty() }?.let { " · " + it.joinToString(" · ") } ?: ""), color = NIGHT_MUT, fontSize = 14.sp)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        NightBtn40("− 5 min", Modifier.weight(1f)) { if (eta - 5 * 60_000L > System.currentTimeMillis() + 5 * 60_000L) add -= 5 }
        NightBtn40("+ 5 min", Modifier.weight(1f)) { add += 5 }
    }
    Text("VENTETID FØR FAMILIEN FÅR BESKJED", color = NIGHT_MUT, fontFamily = PaperFonts.mono, fontSize = 10.5.sp, letterSpacing = 1.2.sp)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(5, 10, 15, 30).forEach { m ->
            val on = m == wait
            Box(Modifier.weight(1f).height(42.dp).clip(RoundedCornerShape(14.dp)).background(if (on) NIGHT_INK else NIGHT_CARD).clickable(role = Role.RadioButton) { wait = m },
                contentAlignment = Alignment.Center) { Text("$m min", color = if (on) NIGHT_BG else NIGHT_INK, fontWeight = FontWeight.Bold, fontSize = 13.5.sp) }
        }
    }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(NIGHT_CARD).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("HVA DELES", color = NIGHT_MUT, fontFamily = PaperFonts.mono, fontSize = 10.5.sp, letterSpacing = 1.2.sp)
        Text("Nå: ingenting. ${names40(recipients40(vm))} ser bare at Hjemlys er på.", color = NIGHT_INK, fontSize = 13.5.sp)
        Text("Hvis du er sen: siste posisjon, ruten, batteri og dekning, siste opplåsing og hvem du var med.", color = NIGHT_MUT, fontSize = 12.5.sp, lineHeight = 17.sp)
    }
    Box(Modifier.fillMaxWidth().height(54.dp).clip(RoundedCornerShape(27.dp)).background(HL_GOLD).clickable(role = Role.Button) { go(eta, wait) }, contentAlignment = Alignment.Center) {
        Text(if (s.hlBusy) "Starter …" else "Start · hjemme ca. ${clock40(eta)}", color = NIGHT_BG, fontWeight = FontWeight.Bold, fontSize = 15.5.sp)
    }
}

@Composable
private fun NightBtn40(t: String, modifier: Modifier, onClick: () -> Unit) {
    Box(modifier.height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, NIGHT_MUT.copy(alpha = .5f), RoundedCornerShape(22.dp)).clickable(role = Role.Button) { onClick() },
        contentAlignment = Alignment.Center) { Text(t, color = NIGHT_INK, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
}

/** 1b: Glimt foreslår («Kinoen er ferdig. Skal jeg si fra til …?») med «Ja, start» / «Ikke nå». */
@Composable
internal fun Suggest40(vm: AppViewModel, night: Boolean) {
    val s = vm.p40
    val sug = s.hlSuggest?.takeIf { it.suggest } ?: return
    val ctx = LocalContext.current
    val (_, go) = rememberStart40(vm)
    val ink = if (night) NIGHT_INK else PaperPal.current.ink
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(if (night) NIGHT_CARD else PaperPal.current.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GlimtFig35("glimt", 34.dp, "talk")
            Column(Modifier.weight(1f)) {
                Text("✦ GLIMT", color = HL_GOLD, fontFamily = PaperFonts.mono, fontSize = 10.5.sp, letterSpacing = 1.2.sp)
                Text(sug.text ?: ((sug.reason?.let { "$it. " } ?: "") + "Skal jeg si fra til ${names40(sug.recipients.ifEmpty { recipients40(vm) })} når du er hjemme?"), color = ink, fontSize = 14.sp, lineHeight = 19.sp)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(20.dp)).background(HL_GOLD).clickable(role = Role.Button) {
                go(etaMs40(sug.eta)?.coerceAtLeast(System.currentTimeMillis() + 5 * 60_000L) ?: (System.currentTimeMillis() + 30 * 60_000L), 15)
            }, contentAlignment = Alignment.Center) { Text("Ja, start", color = NIGHT_BG, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
            Box(Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(20.dp)).border(1.dp, ink.copy(alpha = .3f), RoundedCornerShape(20.dp)).clickable(role = Role.Button) {
                snoozeSuggest40(ctx); s.hlSuggest = sug.copy(suggest = false)
            }, contentAlignment = Alignment.Center) { Text("Ikke nå", color = ink, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
        }
    }
}

/* ---------- Aktiv økt ---------- */

@Composable
private fun ActiveView40(vm: AppViewModel, m: HlSession40, night: Boolean) {
    val p = PaperPal.current
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(m.id) { while (true) { delay(1000); now = System.currentTimeMillis() } }
    val eta = etaMs40(m.eta)
    val left = eta?.let { (it - now) / 1000 } ?: 0
    val late = m.state == "late" || left < 0
    val start = etaMs40(m.startedAt) ?: (eta?.minus(30 * 60_000L) ?: now)
    val pr = (m.progress?.toFloat() ?: eta?.let { ((now - start).toFloat() / (it - start).coerceAtLeast(60_000L)) } ?: 0f).coerceIn(0f, 1f)
    val ink = if (night) NIGHT_INK else p.ink
    val mut = if (night) NIGHT_MUT else p.mut
    if (night) {
        // 1c: stor nedtellingsring.
        Box(Modifier.fillMaxWidth().height(250.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(220.dp)) {
                val sw = 12.dp.toPx()
                drawCircle(NIGHT_CARD, size.minDimension / 2 - sw / 2, style = Stroke(sw))
                drawArc(if (late) HL_RED else HL_GREEN, -90f, 360f * (1f - pr), false, style = Stroke(sw, cap = StrokeCap.Round),
                    topLeft = Offset(sw / 2, sw / 2), size = androidx.compose.ui.geometry.Size(size.width - sw, size.height - sw))
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                val a = kotlin.math.abs(left)
                Text((if (late) "+" else "") + "%d:%02d".format(a / 60, a % 60), color = if (late) HL_RED else NIGHT_INK, fontFamily = PaperFonts.serif, fontSize = 52.sp)
                Text(if (late) "over tiden" else "hjemme ca. ${eta?.let { clock40(it) } ?: "–"}", color = NIGHT_MUT, fontSize = 13.sp)
            }
        }
    } else {
        RouteMap40(vm.p40.hlRoute, false, progress = pr, height = 150.dp)
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(if (late) "SEN · FAMILIEN HAR FÅTT BESKJED" else "PÅ VEI HJEM" + (etaMs40(m.startedAt)?.let { " · startet ${clock40(it)}" } ?: ""),
                color = if (late) HL_RED else p.mut, fontFamily = PaperFonts.mono, fontSize = 10.5.sp, letterSpacing = 1.2.sp)
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(eta?.let { clock40(it) } ?: "–", color = ink, fontFamily = PaperFonts.serif, fontSize = 44.sp)
                Text(if (late) "${-left / 60} min over" else "om ${left / 60} min", color = if (late) HL_RED else HL_GREEN, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.padding(bottom = 8.dp))
            }
            m.leg?.let { Text(it, color = p.mut, fontSize = 13.sp) }
            Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(p.line)) {
                Box(Modifier.fillMaxWidth(pr).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(if (late) HL_RED else HL_GREEN))
            }
        }
    }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(if (night) NIGHT_CARD else p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        KV40("Følger med", names40(m.recipients.ifEmpty { recipients40(vm) }), ink, mut)
        KV40("Deler nå", if (late) "Posisjon, rute, batteri og dekning" else "Ingenting", ink, mut)
        KV40("Hvis du er sen", "Posisjon, rute, batteri +2", ink, mut)
    }
    // 1b: Glimt sjekker inn når tiden er passert.
    if (late) Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (night) NIGHT_CARD else p.card).padding(12.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        GlimtFig35("glimt", 30.dp, "talk")
        Text("✦ Alt OK? " + if (m.state == "late") "Familien har fått beskjed med posisjonen din." else "Svarer du ikke innen ${m.waitMin} min, får familien beskjed.", color = ink, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (late) {
            PButton("Alt OK", Modifier.weight(1f), height = 48.dp) { vm.hjemlysAct40("ok") }
            PButton("+ 15 min", Modifier.weight(1f), kind = "line", height = 48.dp) { vm.hjemlysAct40("plus15") }
        } else {
            PButton("+ 10 min", Modifier.weight(1f), kind = "line", height = 48.dp) { vm.hjemlysAct40("plus") }
            PButton("Jeg er hjemme", Modifier.weight(1f), kind = "lab", height = 48.dp) { vm.hjemlysAct40("home"); vm.p40.hlSheet = false }
        }
    }
    Text("Avslutt", color = mut, fontSize = 13.sp, modifier = Modifier.clickable { vm.hjemlysAct40("end"); vm.p40.hlSheet = false }.padding(4.dp))
    Text("Avsluttes av seg selv når du er innenfor 60 m av hjemmet.", color = mut, fontSize = 12.sp)
    // 1b: familiens logg.
    val log = vm.p40.hlLog
    if (log.isNotEmpty()) {
        Text("LOGG", color = mut, fontFamily = PaperFonts.mono, fontSize = 10.5.sp, letterSpacing = 1.2.sp)
        log.takeLast(8).forEach { l ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(hlClock40(l.at) ?: "", color = mut, fontFamily = PaperFonts.mono, fontSize = 12.sp, modifier = Modifier.width(44.dp))
                Text(l.text, color = ink, fontSize = 13.sp, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun KV40(k: String, v: String, ink: Color, mut: Color) {
    Row { Text(k, color = mut, fontSize = 13.sp, modifier = Modifier.width(118.dp)); Text(v, color = ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f)) }
}

/* ---------- Mottaker: noen er sen ---------- */

@Composable
private fun LateView40(vm: AppViewModel, m: HlMember40, night: Boolean) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val who = firstName37(m.name)
    val mins = hlMinutes40(m.eta)?.let { -it }?.takeIf { it > 0 }
    val sh = m.share
    val ink = if (night) Color.White else p.ink
    val mut = if (night) Color.White.copy(alpha = .75f) else p.mut
    Text(if (night) "MOTTAKER · HJEMLYS" else "${firstName37(vm.me?.name ?: "")} SER DETTE".trim().uppercase(), color = mut, fontFamily = PaperFonts.mono, fontSize = 10.5.sp, letterSpacing = 1.2.sp)
    Text(if (night && mins != null) "$who er $mins min forsinket" else "$who er ikke hjemme ennå", color = ink, fontFamily = PaperFonts.serif, fontSize = 32.sp, lineHeight = 36.sp)
    Text("Ventet ${hlClock40(m.eta) ?: "–"}" + (mins?.let { " · $it min over" } ?: "") + " · svarte ikke på «Alt OK?»", color = mut, fontSize = 14.sp)
    val pos = sh?.optJSONObject("pos")
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(if (night) Color.White.copy(alpha = .1f) else p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        fun s37(k: String) = sh?.optString(k)?.takeIf { it.isNotBlank() && it != "null" }
        KV40("Siste posisjon", s37("place") ?: pos?.let { "%.4f, %.4f".format(it.optDouble("lat"), it.optDouble("lon")) } ?: "Deles når $who er sen", ink, mut)
        KV40("Ruten", s37("route") ?: sh?.optJSONObject("route")?.optString("label")?.takeIf { it.isNotBlank() } ?: "–", ink, mut)
        val bat = sh?.optJSONObject("battery")?.optInt("level", -1)?.takeIf { it >= 0 } ?: sh?.optInt("battery", -1)?.takeIf { it >= 0 }
        val sig = sh?.optJSONObject("signal")?.optString("type")?.takeIf { it.isNotBlank() }
        KV40("Batteri · dekning", listOfNotNull(bat?.let { "$it %" }, sig).joinToString(" · ").ifBlank { "–" }, ink, mut)
        KV40("Sist låst opp", hlClock40(s37("unlockedAt")) ?: "–", ink, mut)
        KV40("Var med", s37("with") ?: "–", ink, mut)
    }
    val phone = sh?.optString("phone")?.takeIf { it.isNotBlank() }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PButton("Ring $who", Modifier.weight(1f), kind = "lab", height = 48.dp) {
            runCatching { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + (phone ?: ""))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        }
        PButton("Åpne kart", Modifier.weight(1f), kind = if (night) "ink" else "line", height = 48.dp) {
            if (pos != null) runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:${pos.optDouble("lat")},${pos.optDouble("lon")}?q=${pos.optDouble("lat")},${pos.optDouble("lon")}(${Uri.encode(who)})")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            else { vm.p40.hlSheet = false; vm.openFamily() }
        }
    }
    if (night) Box(Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(24.dp)).border(1.5.dp, Color.White, RoundedCornerShape(24.dp))
        .clickable(role = Role.Button) { runCatching { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:112")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } },
        contentAlignment = Alignment.Center) { Text("Ring 112", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp) }
    Text("Delingen stopper når $who er hjemme. Ruten slettes etter 24 timer.", color = mut, fontSize = 12.sp, fontStyle = FontStyle.Italic)
}

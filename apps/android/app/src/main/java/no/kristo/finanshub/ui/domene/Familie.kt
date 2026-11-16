@file:JvmName("DomeneFamilie")

package no.kristo.finanshub.ui

import androidx.compose.runtime.saveable.rememberSaveable
import android.annotation.SuppressLint
import android.content.Context
import android.location.LocationManager
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/*
 * Familie: kode som lå i blandingsfilene (Ui41b.kt, Ui42.kt, Ui46.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/* ======================= Skolesoner ======================= */

private tailrec fun act41(c: Context): android.app.Activity? = when (c) { is android.app.Activity -> c; is android.content.ContextWrapper -> act41(c.baseContext); else -> null }

@SuppressLint("MissingPermission")
private fun lastFix41(ctx: Context): android.location.Location? {
    val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    return runCatching { listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER).mapNotNull { lm.getLastKnownLocation(it) }.maxByOrNull { it.time } }.getOrNull()
}

/** «SKOLESONER · ALLE TELLER SOM SKOLE»: chips med navn + radius, «+ Sone» (posisjonen din, radius 50–300 m). Siste sone kan ikke slettes. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun Zones41(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p41
    val ctx = LocalContext.current
    LaunchedEffect(vm.account?.id) { vm.loadZones41() }
    var del by remember { mutableStateOf<String?>(null) }
    PLabel("Skolesoner · alle teller som skole", p.mut)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        (s.zones ?: emptyList()).forEach { z ->
            val armed = del == z.id
            Text(if (armed) "Slett ${z.name}?" else z.label, color = if (armed) p.lab else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp,
                modifier = Modifier.clip(CircleShape).border(1.dp, if (armed) p.lab else p.line, CircleShape)
                    .clickable { if (armed) { vm.deleteZone41(z); del = null } else if ((s.zones?.size ?: 0) > 1) del = z.id else vm.message = "Den siste skolesonen kan ikke slettes" }.padding(12.dp, 7.dp))
        }
        Text("+ Sone", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 12.5.sp,
            modifier = Modifier.clip(CircleShape).background(p.ink).clickable(role = Role.Button) {
                if (ctx.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED)
                    act41(ctx)?.requestPermissions(arrayOf(android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION), 4141)
                s.zoneErr = null; s.zoneAdd = true
            }.padding(12.dp, 7.dp))
    }
    if (s.zoneAdd) {
        var name by rememberSaveable { mutableStateOf("") }
        var r by remember { mutableFloatStateOf(150f) }
        val fix = remember { lastFix41(ctx) }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.bg).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PField("Navn", name, { name = it }, placeholder = "F.eks. Idrettshallen")
            Text(if (fix != null) "Punkt: posisjonen din nå (±${Math.round(fix.accuracy)} m)" else "Fant ingen posisjon. Slå på posisjon og prøv igjen.", color = p.mut, fontSize = 12.5.sp)
            Text("Radius ${r.toInt()} m", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            Slider(r, { r = (it / 10f).toInt() * 10f }, valueRange = 50f..300f, colors = SliderDefaults.colors(thumbColor = p.ink, activeTrackColor = p.ink))
            s.zoneErr?.let { Text(it, color = p.lab, fontSize = 12.5.sp) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("Avbryt", Modifier.weight(1f), kind = "line", height = 40.dp) { s.zoneAdd = false }
                PButton("Lagre sone", Modifier.weight(1f), height = 40.dp) { if (fix != null) vm.addZone41(name, fix.latitude, fix.longitude, r.toInt()) else s.zoneErr = "Mangler posisjon" }
            }
        }
    }
    Text("Når du forlater siste skolesone (og er ute i 2 min, hverdager 07–18) vises Min reise på Oversikt og som Live Update.", color = p.mut, fontSize = 12.sp, lineHeight = 16.sp)
}

/* ======================= Familie → Vel fremme ======================= */

private val VF_GREEN42 = Color(0xFF2F9E5B)

private val VF_RED42 = Color(0xFFD9412E)

private val VF_GOLD42 = Color(0xFFE2B33C)

/** Rekkefølge i «Aktive i familien»: forsinket først, så på vei, så sjekket inn. */
private fun vfRank42(state: String): Int = when (state) { "late" -> 0; "checked_in", "checkedIn", "inne" -> 2; else -> 1 }

private fun vfTitle42(m: HlMember40): String {
    val n = firstName37(m.name)
    val min = hlMinutes40(m.eta)
    return when (m.state) {
        "late" -> "$n er ${min?.takeIf { it < 0 }?.let { "${-it} min " } ?: ""}forsinket"
        "checked_in", "checkedIn", "inne" -> "$n sjekket inn"
        else -> "$n er på vei hjem"
    }
}

private fun vfSub42(m: HlMember40): String = when (m.state) {
    "late" -> "Trykk for siste posisjon og ring"
    "checked_in", "checkedIn", "inne" -> listOfNotNull(m.share?.optString("place")?.takeIf { it.isNotBlank() }, hlClock40(m.since)).joinToString(" · ").ifBlank { "Sjekket inn" }
    else -> (hlClock40(m.eta)?.let { "Hjemme ca. $it" } ?: "På vei") + " · i rute"
}

/** Statuslinja over kartet når en Vel fremme-økt pågår («Vel fremme på · Rune er på vei · 12 min»). Trykk åpner fanen. */
@Composable
internal fun VelFremmeStatus42(vm: AppViewModel) {
    val p = PaperPal.current
    val h = vm.p40.hl ?: return
    val meId = vm.myUserId40()
    val mine = h.mine?.takeIf { it.state != "home" && it.state != "ended" }
    val others = h.household.filter { it.userId != meId && it.userId != h.mine?.userId && it.state !in setOf("home", "ended") }.sortedBy { vfRank42(it.state) }
    val first = others.firstOrNull()
    if (mine == null && first == null) return
    val text = when {
        first != null -> "Vel fremme på · " + vfTitle42(first).replace(" er på vei hjem", " er på vei") + (hlMinutes40(first.eta)?.takeIf { it >= 0 }?.let { " · $it min" } ?: "")
        else -> "Vel fremme på · du er på vei" + (hlMinutes40(mine?.eta)?.takeIf { it >= 0 }?.let { " · $it min" } ?: "")
    }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(16.dp))
            .clickable(role = Role.Button) { vm.famTab = "velfremme" }.padding(12.dp, 9.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        HlDot40(if (first?.state == "late") "late" else "onTheWay", 22.dp)
        Text(text, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Text("›", color = p.mut, fontSize = 15.sp)
    }
}

/**
 * Fanen Vel fremme (tidligere Hjemlys): tittel med lys-prikken, «Hva vil du si fra om?» (På vei hjem · Sjekket inn · Drar snart · Drar nå),
 * egen økt, «Aktive i familien» (forsinket først) og Glimt-forslaget («Ja, start» / «Ikke nå»).
 */
@Composable
internal fun VelFremmeTab42(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p40
    LaunchedEffect(vm.account?.id) { vm.loadHjemlys40(force = true) }
    GjentaMensSynlig { while (true) { kotlinx.coroutines.delay(30_000); vm.loadHjemlys40(force = true) } }
    val h = s.hl
    val meId = vm.myUserId40()
    val mine = h?.mine?.takeIf { it.state != "home" && it.state != "ended" }
    val others = (h?.household ?: emptyList()).filter { it.userId != meId && it.userId != h?.mine?.userId && it.state !in setOf("home", "ended") }.sortedBy { vfRank42(it.state) }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(horizontal = 4.dp)) {
            HlDot40(mine?.state, 34.dp)
            Column(Modifier.weight(1f)) {
                PSerif("Vel fremme", 26.sp, maxLines = 1)
                Text("Si fra til de du vil når du er trygt fremme.", color = p.mut, fontSize = 13.sp, maxLines = 2)
            }
        }
        if (s.hlMissing) Text("Vel fremme finnes ikke på serveren ennå. Oppdater Homelab.", color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp))
        if (mine != null) HjemlysCard40(vm)
        else {
            PLabel("Hva vil du si fra om?", modifier = Modifier.padding(start = 4.dp))
            val opts = listOf(
                Triple("På vei hjem", "Med tid og «Alt OK?»", true), Triple("Sjekket inn", "Jeg er fremme", false),
                Triple("Drar snart", "Om 15 min, 30 min, 1 t", false), Triple("Drar nå", "Hjem, annet sted eller ikke oppgi", false),
            )
            opts.chunked(2).forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { (n, d, main) ->
                        Column(
                            Modifier.weight(1f).heightIn(min = 92.dp).clip(RoundedCornerShape(20.dp)).background(if (main) p.ink else p.card)
                                .then(if (main) Modifier else Modifier.border(1.dp, p.line, RoundedCornerShape(20.dp)))
                                .clickable(role = Role.Button, onClickLabel = n) { Haptics.tap(); s.hlSheet = true }.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(n, color = if (main) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1)
                            Text(d, color = if (main) p.bg.copy(alpha = .75f) else p.mut, fontSize = 12.sp, lineHeight = 15.sp, maxLines = 2)
                        }
                    }
                }
            }
        }
        if (others.isNotEmpty()) {
            PLabel("Aktive i familien", modifier = Modifier.padding(start = 4.dp, top = 4.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)) {
                others.forEachIndexed { i, m ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    val dot = when (m.state) { "late" -> VF_RED42; "checked_in", "checkedIn", "inne" -> VF_GOLD42; else -> VF_GREEN42 }
                    Row(
                        Modifier.fillMaxWidth().clickable(role = Role.Button) {
                            Haptics.tap()
                            if (m.state == "late") { s.hlLateFor = m.userId; s.hlSheet = true }
                            else { vm.famSelect(m.userId); vm.famTab = "kart" }
                        }.padding(14.dp, 12.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(Modifier.size(40.dp).clip(CircleShape).background(AV39_BG), contentAlignment = Alignment.Center) {
                            Text(initials39(m.name), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
                        }
                        Column(Modifier.weight(1f)) {
                            Text(vfTitle42(m), color = if (m.state == "late") VF_RED42 else p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(vfSub42(m), color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Box(Modifier.size(10.dp).clip(CircleShape).background(dot))
                    }
                }
            }
        }
        // Glimt-forslaget (1b) under valgene, med samme kortstil.
        if (mine == null) Suggest40(vm, false)
    }
}

/* ======================= Familie → Soner: ikonvelger med søk ======================= */

/**
 * Ikonvelger (ny og rediger sone): søkefelt («Søk i ikoner, f.eks. båt, kirke, ski …»), 18 vanlige + «Vis alle (N)», «N treff» /
 * «Ingen ikoner heter …», og treff fra Lucide og Tabler via Iconify under de innebygde («36 fra Lucide og Tabler · søkte «boat»»).
 */
@Composable
internal fun IconPicker42(
    selected: String, accent: Color, min: Dp, icons: List<Triple<String, String, String>>,
    draw: @Composable (String, Color) -> Unit, onPick: (String) -> Unit,
) {
    val p = PaperPal.current
    var q by rememberSaveable { mutableStateOf("") }
    var all by remember { mutableStateOf(false) }
    var ext by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var extBusy by remember { mutableStateOf(false) }
    LaunchedEffect(q) {
        ext = emptyList()
        if (q.trim().length < 2) return@LaunchedEffect
        kotlinx.coroutines.delay(450)
        extBusy = true
        ext = Ify42.search(q)
        extBusy = false
    }
    val hits = icons.filter { (k, n, _) -> iconHit42(k, n, q) }
    val shown = if (q.isNotBlank() || all) hits else hits.take(18)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PField("Ikon", q, { q = it }, placeholder = "Søk i ikoner, f.eks. båt, kirke, ski …")
        IconRows42(shown.map { it.first to it.second } + (if (selected.startsWith("ify:") && q.isBlank()) listOf(selected to "Valgt ikon") else emptyList()), selected, accent, min, draw, onPick)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(when {
                q.isBlank() -> "${icons.size} ikoner"
                hits.isEmpty() -> "Ingen ikoner heter «${q.trim()}»"
                else -> "${hits.size} treff"
            }, color = p.mut, fontSize = 12.sp, modifier = Modifier.weight(1f))
            if (q.isBlank() && icons.size > 18) Box(Modifier.height(32.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable { all = !all }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                Text(if (all) "Vis færre" else "Vis alle (${icons.size})", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
            }
        }
        if (extBusy) Text("Søker i Lucide og Tabler …", color = p.mut, fontSize = 12.sp)
        if (ext.isNotEmpty()) {
            Text("${ext.size} fra Lucide og Tabler · søkte «${ICON_EN42[q.trim().lowercase()] ?: q.trim()}»", color = p.mut, fontSize = 12.sp)
            IconRows42(ext.map { it.first to it.first.substringAfterLast(':').replace('-', ' ') }, selected, accent, min, draw, onPick)
        }
    }
}

@Composable
private fun IconRows42(list: List<Pair<String, String>>, selected: String, accent: Color, min: Dp, draw: @Composable (String, Color) -> Unit, onPick: (String) -> Unit) {
    val p = PaperPal.current
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val cols = maxOf(1, ((maxWidth + 6.dp) / (min + 6.dp)).toInt())
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            list.chunked(cols).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    row.forEach { (k, n) ->
                        val on = k == selected
                        Box(
                            Modifier.weight(1f).height(min).clip(RoundedCornerShape(12.dp)).background(if (on) accent else Color.Transparent)
                                .border(2.dp, if (on) accent else p.line, RoundedCornerShape(12.dp))
                                .clickable(role = Role.Button, onClickLabel = n) { Haptics.select(); onPick(k) }.semantics { contentDescription = n },
                            contentAlignment = Alignment.Center,
                        ) { draw(k, if (on) Color.White else p.ink) }
                    }
                    repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

/* ======================= Familie: ikoner for Soner og Helse ======================= */

/** 24×24, strek 1,8, runde ender, currentColor (Icon-tint). Fasit: Mobil Papir App.dc.html → TSV. */
internal object FamIcons46 {
    private fun stroke(name: String, d: String): ImageVector = ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).addPath(
        pathData = PathParser().parsePathString(d).toNodes(), fill = null, stroke = SolidColor(Color.Black), strokeLineWidth = 1.8f,
        strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
    ).build()
    val zones: ImageVector by lazy { stroke("soner46", "M12 15s-3.5-3-3.5-6a3.5 3.5 0 0 1 7 0c0 3-3.5 6-3.5 6zM12 9h.01M5.5 14.2C3.9 14.9 3 15.9 3 17c0 2.2 4 4 9 4s9-1.8 9-4c0-1.1-.9-2.1-2.5-2.8") }
    val health: ImageVector by lazy { stroke("helse46", "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM7.5 12.5h2.4l1.3-2.6 1.8 5 1.3-2.4h2.2") }
}

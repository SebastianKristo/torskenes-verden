package no.kristo.finanshub.ui

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Paint
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.health.connect.client.PermissionController
import no.kristo.finanshub.*
import no.kristo.finanshub.family.FamilyService
import no.kristo.finanshub.family.HealthSync
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon
import org.osmdroid.views.overlay.Polyline
import java.time.Duration
import java.time.Instant

/* ---------------- Familie og kart ---------------- */

private val ZONE_COLORS = listOf("#B23A2A", "#2F7A4F", "#2F5D8A", "#C9A227", "#5B4A8A", "#E07A5F")

private fun ago(iso: String?): String {
    val t = runCatching { Instant.parse(iso!!) }.getOrNull() ?: return ""
    val m = Duration.between(t, Instant.now()).toMinutes()
    return when { m < 1 -> "nå"; m < 60 -> "$m min siden"; m < 60 * 24 -> "${m / 60} t siden"; else -> "${m / 1440} d siden" }
}

private fun kmh(s: Double?) = s?.let { "${Math.round(it * 3.6)} km/t" }

/**
 * Familie: alle på serveren på et ekte kart (OpenStreetMap), med sanntidsposisjon, spor og fart, sensorer fra mobilen
 * (batteri, lading, aktivitet, nøyaktighet), soner med varsel per person, personvern (pause/av, nøyaktig/omtrentlig) og helse.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun FamilyScreen(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    BackHandler { when { vm.famZoneDraft != null || vm.famZoneEdit != null -> { vm.famZoneDraft = null; vm.famZoneEdit = null }; vm.famPrivacy -> vm.famPrivacy = false; else -> vm.closeFamily() } }
    val f = vm.family
    val me = f?.me
    val sel = f?.members?.firstOrNull { it.userId == vm.famSel }
    // Posisjon: først «Når i bruk», deretter «Alltid» (Android 10+) så delingen virker i bakgrunnen.
    val bgPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { FamilyService.sync(ctx) }
    val locPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r: Map<String, Boolean> ->
        if (r.values.any { it }) {
            if (Build.VERSION.SDK_INT >= 29 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) bgPerm.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            vm.famSetSharing("on")
        } else vm.message = "Posisjon er ikke tillatt. Slå det på i Android-innstillingene for FinansHub."
    }
    val notifPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    val startSharing: () -> Unit = {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
        if (FamilyService.hasLocation(ctx)) vm.famSetSharing("on")
        else locPerm.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
    }

    var tab by remember { mutableStateOf("kart") }
    Box(Modifier.fillMaxSize().background(p.bg)) {
        Column(Modifier.fillMaxSize()) {
            // Kartet øverst (40 % av høyden på Kart, mindre på Soner og Helse), med tilbake og tittel oppå.
            if (tab != "helse") Box(Modifier.fillMaxWidth().fillMaxHeight(if (tab == "kart") 0.42f else 0.3f)) {
                FamilyMap(vm, Modifier.matchParentSize())
                Row(Modifier.fillMaxWidth().statusBarsPadding().padding(12.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.height(34.dp).clip(CircleShape).background(Color(0xCC1B1A17)).clickable { vm.closeFamily() }.padding(start = 10.dp, end = 14.dp), contentAlignment = Alignment.Center) {
                        Text("‹ Hjem", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    }
                    Spacer(Modifier.weight(1f))
                    Box(Modifier.clip(CircleShape).background(Color(0xCC1B1A17)).padding(12.dp, 7.dp)) {
                        Text(if (vm.famZoneDraft != null) "Trykk på kartet der sonen skal være" else "Trykk på kartet for ny sone", color = Color.White, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Text("© OpenStreetMap", color = Color(0xFF1B1A17), fontSize = 9.sp,
                    modifier = Modifier.align(Alignment.BottomEnd).padding(6.dp).clip(RoundedCornerShape(4.dp)).background(Color.White.copy(alpha = .75f)).padding(4.dp, 1.dp))
            } else Row(Modifier.fillMaxWidth().statusBarsPadding().padding(12.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.height(34.dp).clip(CircleShape).background(p.ink).clickable { vm.closeFamily() }.padding(start = 10.dp, end = 14.dp), contentAlignment = Alignment.Center) {
                    Text("‹ Hjem", color = p.bg, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                }
            }
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 12.dp, 16.dp, 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item {
                    Row(verticalAlignment = Alignment.Bottom) {
                        PSerif("Familie", 30.sp, modifier = Modifier.weight(1f))
                        Text("Min deling ›", color = p.lab, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clip(CircleShape).clickable { vm.famPrivacy = true }.padding(8.dp, 4.dp))
                    }
                }
                // Tre faner: Kart, Soner og Helse.
                item {
                    Row(Modifier.fillMaxWidth().clip(CircleShape).border(1.dp, p.line, CircleShape).padding(3.dp)) {
                        listOf("kart" to "Kart", "soner" to "Soner", "helse" to "Helse").forEach { (k, n) ->
                            val on = tab == k
                            Box(Modifier.weight(1f).height(36.dp).clip(CircleShape).background(if (on) p.ink else Color.Transparent).clickable { Haptics.select(); tab = k }, contentAlignment = Alignment.Center) {
                                Text(n, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp)
                            }
                        }
                    }
                }
                vm.familyError?.let { e -> item { Text(e, color = p.lab, fontSize = 13.sp) } }
                if (f == null && vm.familyError == null) item { Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
                when (tab) {
                    "kart" -> {
                        if (me != null) item { MySharing(vm, me, startSharing) }
                        item { PeopleChips(vm) }
                        if (sel != null) item { PersonCard(vm, sel) }
                        item { PHead("Hendelser") }
                        if (f != null && f.events.isEmpty()) item { Text("Ingen hendelser ennå.", color = p.mut, fontSize = 13.sp) }
                        items((f?.events ?: emptyList()).take(30).size) { i -> EventRow(f!!, f.events[i]) }
                    }
                    "soner" -> {
                        item { PHead("Soner", "+ Ny sone") { vm.famZoneDraft = (sel?.last?.lat ?: 59.9139) to (sel?.last?.lon ?: 10.7522) } }
                        item { Text("Trykk på en person i en sone for å slå varsel av eller på når de kommer og går.", color = p.mut, fontSize = 12.5.sp) }
                        if (f != null && f.zones.isEmpty()) item { Text("Ingen soner. Trykk på kartet for å lage en, f.eks. Hjem eller Skole.", color = p.mut, fontSize = 13.sp) }
                        items((f?.zones ?: emptyList()).size) { i -> ZoneCard(vm, f!!, f.zones[i]) }
                    }
                    else -> {
                        item { HealthHeader(vm) }
                        val ms = (f?.members ?: emptyList())
                        if (f != null && ms.none { it.health != null }) item { Text("Ingen deler helsedata ennå. Slå det på under Min deling.", color = p.mut, fontSize = 13.sp) }
                        items(ms.size) { i -> ms[i].health?.let { h -> HealthCard(ms[i], h) } }
                    }
                }
            }
        }
    }
    if (vm.famZoneDraft != null || vm.famZoneEdit != null) ZoneSheet(vm)
    if (vm.famPrivacy) PrivacySheet(vm, startSharing)
}

@Composable
private fun MySharing(vm: AppViewModel, me: FamMe, startSharing: () -> Unit) {
    val p = PaperPal.current
    val on = me.sharing == "on"
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (on) p.posSoft else p.surf2).padding(14.dp, 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(if (on) p.pos else p.mut))
        Column(Modifier.weight(1f)) {
            Text(when (me.sharing) { "on" -> "Familien ser hvor du er"; "paused" -> "Pauset · de andre ser at du har pauset"; else -> "Du deler ikke posisjonen" }, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            Text(if (me.precision == "approx") "Omtrentlig, rundt 1 km" else "Nøyaktig punkt", color = p.mut, fontSize = 12.sp)
        }
        if (on) PButton("Pause", height = 36.dp, kind = "line") { vm.famSetSharing("paused") }
        else PButton("Del", height = 36.dp) { startSharing() }
    }
}

@Composable
private fun PeopleChips(vm: AppViewModel) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        (vm.family?.members ?: emptyList()).forEach { m ->
            val on = m.userId == vm.famSel
            Row(
                Modifier.clip(CircleShape).background(if (on) p.ink else p.card).border(1.dp, p.line, CircleShape).clickable { vm.famSelect(m.userId) }.padding(start = 4.dp, end = 14.dp, top = 4.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ServerImage(vm, m.avatarUrl, Modifier.size(32.dp).clip(CircleShape).background(p.surf2)) {
                    Text(m.name.take(1).uppercase(), color = p.ink, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.Center))
                }
                Column {
                    Text(m.name.split(' ').first(), color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1)
                    Text(when (m.sharing) { "paused" -> "Pauset"; "off" -> "Deler ikke"; else -> ago(m.last?.ts).ifBlank { "Ingen posisjon" } },
                        color = if (on) p.bg.copy(alpha = .75f) else if (m.sharing != "on") p.lab else p.mut, fontSize = 11.sp, maxLines = 1)
                }
            }
        }
    }
}

/** Personkortet: batteri, lading, aktivitet, fart, nøyaktighet, enhet og koordinater, med veibeskrivelse og «Spill av lyd». */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PersonCard(vm: AppViewModel, sel: FamMember) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val l = sel.last
    val first = sel.name.split(' ').first()
    PCard {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.Bottom) {
                PSerif(sel.name, 22.sp, modifier = Modifier.weight(1f), maxLines = 1)
                Text("@${sel.username}", color = p.mut, fontSize = 12.5.sp)
            }
            if (sel.sharing != "on") Text(if (sel.sharing == "paused") "$first har satt delingen på pause." else "$first deler ikke posisjonen.", color = p.lab, fontSize = 13.sp)
            else if (l == null) Text("Ingen posisjon ennå.", color = p.mut, fontSize = 13.sp)
            else {
                Text(listOfNotNull(l.place ?: "Ukjent sted", ago(l.ts)).filter { it.isNotBlank() }.joinToString(" · "), color = p.mut, fontSize = 12.5.sp)
                PLabel("Sensorer fra mobilen")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Sensor("Batteri", l.battery?.let { "$it %" } ?: "–", if (l.charging == true) "Lader" else null)
                    Sensor("Aktivitet", activityText(l.activity), null)
                    Sensor("Fart", kmh(l.speed) ?: "–", null)
                    Sensor("Nøyaktighet", l.acc?.let { "± ${Math.round(it)} m" } ?: if (sel.precision == "approx") "ca. 1 km" else "–", null)
                    l.device?.let { Sensor("Enhet", it, null) }
                    Sensor("Koordinater", String.format(java.util.Locale.US, "%.4f, %.4f", l.lat, l.lon), if (sel.precision == "approx") "Omtrentlig" else null)
                }
                if (vm.famTrack.size > 1) Text("Spor siste 24 t: ${vm.famTrack.size} punkter · toppfart ${kmh(vm.famTrack.mapNotNull { it.speed }.maxOrNull()) ?: "–"}", color = p.mut, fontSize = 12.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PButton("Veibeskrivelse", Modifier.weight(1f), kind = "line", height = 42.dp) {
                        openLink(ctx, String.format(java.util.Locale.US, "https://www.google.com/maps/dir/?api=1&destination=%.6f,%.6f", l.lat, l.lon))
                    }
                    PButton("Spill av lyd", Modifier.weight(1f), kind = "line", height = 42.dp) { vm.famPing(sel.userId, first) }
                }
            }
        }
    }
}

@Composable
private fun EventRow(f: Family, e: FamEvent) {
    val p = PaperPal.current
    val who = f.members.firstOrNull { it.userId == e.userId }?.name?.split(' ')?.firstOrNull() ?: "Noen"
    val zone = e.zoneName ?: f.zones.firstOrNull { it.id == e.zoneId }?.name ?: "sonen"
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(if (e.kind == "leave") "↗" else "↘", color = if (e.kind == "leave") p.lab else p.pos, fontSize = 16.sp)
        Text(if (e.kind == "leave") "$who forlot $zone" else "$who kom til $zone", color = p.ink, fontSize = 14.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(ago(e.ts), color = p.mut, fontSize = 12.sp)
    }
}

/** Sone med hvem som er der nå, og varsel per person (Kommer / Forlater). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ZoneCard(vm: AppViewModel, f: Family, z: FamZone) {
    val p = PaperPal.current
    val d = FloatArray(1)
    val here = f.members.filter { m ->
        val l = m.last ?: return@filter false
        if (m.sharing != "on") return@filter false
        android.location.Location.distanceBetween(l.lat, l.lon, z.lat, z.lon, d)
        d[0] <= z.radius
    }
    PCard(onClick = { vm.famZoneEdit = z }) {
        Column(Modifier.padding(14.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(14.dp).clip(CircleShape).background(Color(z.color)))
                Column(Modifier.weight(1f)) {
                    Text(z.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                    Text("${Math.round(z.radius)} m · ${if (here.isEmpty()) "ingen der nå" else here.joinToString(", ") { it.name.split(' ').first() }}", color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text("›", color = p.mut)
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                f.members.forEach { m ->
                    val cur = z.notify[m.userId] ?: (false to false)
                    val on = cur.first || cur.second
                    PChip((if (on) "🔔 " else "") + m.name.split(' ').first(), on) { vm.famZoneNotify(z.id, m.userId, !on, !on) }
                }
            }
        }
    }
}

@Composable
private fun HealthHeader(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val st = remember { runCatching { HealthSync.status(ctx) }.getOrDefault(2) }
    val shared = vm.family?.me?.shareHealth?.filterValues { it }?.keys ?: emptySet()
    PCard(onClick = { vm.famPrivacy = true }) {
        Row(Modifier.padding(14.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f)) {
                Text("Health Connect", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                Text(when {
                    st != 0 -> "Ikke koblet til · trykk for å koble"
                    shared.isEmpty() -> "Du deler ingen helsedata · trykk for å velge"
                    else -> "Koblet til via appen · ${shared.size} felt deles"
                }, color = p.mut, fontSize = 12.5.sp)
            }
            Text("›", color = p.mut)
        }
    }
}

/** Helse per person: skritt mot mål, hvilepuls, puls nå, søvn i natt, aktive kalorier og siste 7 dager. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HealthCard(m: FamMember, h: FamHealth) {
    val p = PaperPal.current
    val goal = 8000
    PCard {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.Bottom) {
                PSerif(m.name.split(' ').first(), 22.sp, modifier = Modifier.weight(1f))
                Text(ago(h.updatedAt).let { if (it.isBlank()) "I dag" else "synket $it" }, color = p.mut, fontSize = 12.sp)
            }
            h.steps?.let { st ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row { Text("Skritt", color = p.mut, fontSize = 12.sp, modifier = Modifier.weight(1f)); Text("${n0(st.toDouble())} av ${n0(goal.toDouble())}", color = p.ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold) }
                    Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(p.line)) {
                        Box(Modifier.fillMaxHeight().fillMaxWidth((st.toFloat() / goal).coerceIn(0.02f, 1f)).clip(CircleShape).background(p.pos))
                    }
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                h.restingHr?.let { Sensor("Hvilepuls", "$it", "slag/min") }
                h.hr?.let { Sensor("Puls nå", "$it", "slag/min") }
                h.sleepMin?.let { Sensor("Søvn i natt", "${it / 60} t ${it % 60} m", "Mål 8 t") }
                h.activeKcal?.let { Sensor("Aktive kalorier", "$it", "kcal") }
            }
            if (h.week.isNotEmpty()) {
                PLabel("Snitt siste 7 dager")
                val mx = (h.week.mapNotNull { it.steps }.maxOrNull() ?: 1).coerceAtLeast(1)
                Row(Modifier.fillMaxWidth().height(70.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
                    h.week.takeLast(7).forEach { d ->
                        Column(Modifier.weight(1f).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Bottom) {
                            Box(Modifier.fillMaxWidth().fillMaxHeight(((d.steps ?: 0).toFloat() / mx).coerceIn(0.03f, 0.8f)).clip(RoundedCornerShape(5.dp)).background(p.ink.copy(alpha = .8f)))
                            Text(runCatching { java.time.LocalDate.parse(d.date.take(10)).dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, NB16).take(2) }.getOrDefault(""), color = p.mut, fontSize = 10.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Sensor(label: String, value: String, sub: String?) {
    val p = PaperPal.current
    Column(Modifier.widthIn(min = 92.dp).clip(RoundedCornerShape(12.dp)).background(p.surf2).padding(10.dp, 8.dp)) {
        Text(label, color = p.mut, fontSize = 11.sp, maxLines = 1)
        FitText(value, p.ink, 17.sp, FontWeight.Medium, family = PaperFonts.serif)
        if (sub != null) Text(sub, color = p.mut, fontSize = 10.5.sp, maxLines = 1)
    }
}

/** Kartet: OSM-fliser (osmdroid), avatar-markører, spor for valgt person og sonene som sirkler. Trykk lager en ny sone. */
@Composable
private fun FamilyMap(vm: AppViewModel, modifier: Modifier) {
    val f = vm.family
    val track = vm.famTrack
    val sel = vm.famSel
    val ink = PaperPal.current.ink.toArgb()
    val lab = PaperPal.current.lab.toArgb()
    var centered by remember { mutableStateOf(false) }
    var mapRef by remember { mutableStateOf<MapView?>(null) }
    // osmdroid må få onResume/onPause, ellers lastes ikke flisene (kartet ble stående tomt).
    DisposableEffect(mapRef) {
        val m = mapRef
        m?.onResume()
        onDispose { m?.onPause(); m?.onDetach() }
    }
    AndroidView(
        modifier = modifier,
        factory = { c ->
            val cfg = Configuration.getInstance()
            cfg.load(c, c.getSharedPreferences("osmdroid", android.content.Context.MODE_PRIVATE))
            // OSM krever en egen User-Agent; uten den blokkeres flisene.
            cfg.userAgentValue = "FinansHub/" + (runCatching { c.packageManager.getPackageInfo(c.packageName, 0).versionName }.getOrNull() ?: "1") + " (" + c.packageName + ")"
            cfg.osmdroidBasePath = c.cacheDir
            cfg.osmdroidTileCache = java.io.File(c.cacheDir, "osm-tiles")
            MapView(c).apply {
                setTileSource(TileSourceFactory.MAPNIK)
                setUseDataConnection(true)
                setMultiTouchControls(true)
                isTilesScaledToDpi = true
                zoomController.setVisibility(org.osmdroid.views.CustomZoomButtonsController.Visibility.NEVER)
                controller.setZoom(12.0)
                controller.setCenter(GeoPoint(59.9139, 10.7522))
                mapRef = this
            }
        },
        update = { map ->
            map.overlays.clear()
            map.overlays.add(MapEventsOverlay(object : MapEventsReceiver {
                override fun singleTapConfirmedHelper(pt: GeoPoint?): Boolean { if (pt == null) return false; vm.famZoneDraft = pt.latitude to pt.longitude; return true }
                override fun longPressHelper(pt: GeoPoint?): Boolean = false
            }))
            f?.zones?.forEach { z ->
                val poly = Polygon(map)
                poly.setPoints(Polygon.pointsAsCircle(GeoPoint(z.lat, z.lon), z.radius))
                val col = z.color.toInt()
                poly.fillPaint.color = android.graphics.Color.argb(46, android.graphics.Color.red(col), android.graphics.Color.green(col), android.graphics.Color.blue(col))
                poly.outlinePaint.color = col
                poly.outlinePaint.strokeWidth = 4f
                poly.title = z.name
                poly.setOnClickListener { _, _, _ -> vm.famZoneEdit = z; true }
                map.overlays.add(poly)
            }
            if (track.size > 1) {
                val line = Polyline(map)
                line.setPoints(track.map { GeoPoint(it.lat, it.lon) })
                line.outlinePaint.color = lab
                line.outlinePaint.strokeWidth = 8f
                line.outlinePaint.strokeCap = Paint.Cap.ROUND
                map.overlays.add(line)
            }
            f?.members?.forEach { m ->
                val l = m.last ?: return@forEach
                if (m.sharing != "on") return@forEach
                val mk = Marker(map)
                mk.position = GeoPoint(l.lat, l.lon)
                mk.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                mk.title = m.name
                mk.snippet = listOfNotNull(ago(l.ts), kmh(l.speed), l.battery?.let { "$it %" }).joinToString(" · ")
                mk.icon = avatarPin(map.context, m.name.take(1).uppercase(), if (m.userId == sel) lab else ink)
                mk.setOnMarkerClickListener { _, _ -> vm.famSelect(m.userId); true }
                map.overlays.add(mk)
            }
            val target = f?.members?.firstOrNull { it.userId == sel }?.last ?: f?.members?.firstNotNullOfOrNull { it.last }
            if (target != null && !centered) { map.controller.setCenter(GeoPoint(target.lat, target.lon)); map.controller.setZoom(14.0); centered = true }
            map.invalidate()
        },
    )
    LaunchedEffect(sel) { centered = false }
}

/** Rund markør med initial (tegnes som bitmap, osmdroid bruker Drawable). */
private fun avatarPin(ctx: android.content.Context, letter: String, color: Int): android.graphics.drawable.Drawable {
    val d = ctx.resources.displayMetrics.density
    val size = (40 * d).toInt()
    val bmp = android.graphics.Bitmap.createBitmap(size, (size * 1.2f).toInt(), android.graphics.Bitmap.Config.ARGB_8888)
    val c = android.graphics.Canvas(bmp)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = color
    c.drawCircle(size / 2f, size / 2f, size / 2f - 2 * d, paint)
    val path = android.graphics.Path().apply { moveTo(size / 2f - 7 * d, size - 6 * d); lineTo(size / 2f + 7 * d, size - 6 * d); lineTo(size / 2f, size * 1.18f); close() }
    c.drawPath(path, paint)
    paint.color = android.graphics.Color.WHITE
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = 3 * d
    c.drawCircle(size / 2f, size / 2f, size / 2f - 3.5f * d, paint)
    paint.style = Paint.Style.FILL
    paint.textSize = 17 * d
    paint.textAlign = Paint.Align.CENTER
    paint.isFakeBoldText = true
    c.drawText(letter, size / 2f, size / 2f + 6 * d, paint)
    return android.graphics.drawable.BitmapDrawable(ctx.resources, bmp)
}

/** Ny eller endret sone: navn, radius og farge, og varsel per person (kom til / forlot). */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun ZoneSheet(vm: AppViewModel) {
    val p = PaperPal.current
    val z = vm.famZoneEdit
    val pt = z?.let { it.lat to it.lon } ?: vm.famZoneDraft ?: return
    var name by remember(z?.id) { mutableStateOf(z?.name ?: "") }
    var radius by remember(z?.id) { mutableStateOf((z?.radius ?: 150.0).toFloat()) }
    var col by remember(z?.id) { mutableStateOf(z?.color?.let { c -> ZONE_COLORS.firstOrNull { color(it) == c } } ?: ZONE_COLORS[0]) }
    ModalBottomSheet(onDismissRequest = { vm.famZoneDraft = null; vm.famZoneEdit = null }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().padding(18.dp, 0.dp, 18.dp, 34.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif(if (z == null) "Ny sone" else z.name, 26.sp)
            Text(String.format(java.util.Locale.US, "%.5f, %.5f", pt.first, pt.second), color = p.mut, fontSize = 12.sp, fontFamily = PaperFonts.mono)
            PField("Navn", name, { name = it }, placeholder = "F.eks. Hjemme")
            Text("Radius ${Math.round(radius)} m", color = p.ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
            Slider(radius, { radius = it }, valueRange = 50f..2000f, colors = SliderDefaults.colors(thumbColor = p.ink, activeTrackColor = p.ink, inactiveTrackColor = p.line))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ZONE_COLORS.forEach { c ->
                    Box(Modifier.size(34.dp).clip(CircleShape).background(Color(color(c))).border(if (c == col) 3.dp else 0.dp, p.ink, CircleShape).clickable { col = c })
                }
            }
            if (z != null) {
                PLabel("Varsel for meg når …")
                PCard {
                    (vm.family?.members ?: emptyList()).forEachIndexed { i, m ->
                        val cur = z.notify[m.userId] ?: (false to false)
                        Column {
                            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                            Row(Modifier.fillMaxWidth().padding(14.dp, 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(m.name.split(' ').first(), color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                                PChip("Kommer", cur.first) { vm.famZoneNotify(z.id, m.userId, !cur.first, cur.second) }
                                PChip("Forlater", cur.second) { vm.famZoneNotify(z.id, m.userId, cur.first, !cur.second) }
                            }
                        }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (z != null) PButton("Slett", Modifier.weight(1f), kind = "line") { vm.famDeleteZone(z.id) }
                PButton("Lagre", Modifier.weight(1f)) { vm.famSaveZone(z?.id, name, pt.first, pt.second, radius.toDouble(), col) }
            }
        }
    }
}

/** Personvern og helse: pause/av, nøyaktig eller omtrentlig posisjon, og hvilke helsedata som deles (Health Connect). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PrivacySheet(vm: AppViewModel, startSharing: () -> Unit) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val me = vm.family?.me
    var health by remember { mutableStateOf(me?.shareHealth?.filterValues { it }?.keys ?: emptySet()) }
    val hcStatus = remember { runCatching { HealthSync.status(ctx) }.getOrDefault(2) }
    val hcPerm = rememberLauncherForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
        if (granted.isEmpty() && health.isNotEmpty()) vm.message = "Health Connect ga ikke tilgang. Velg feltene på nytt, eller gi tilgang i Health Connect."
        vm.famSetHealth(health)
    }
    ModalBottomSheet(onDismissRequest = { vm.famPrivacy = false }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().padding(18.dp, 0.dp, 18.dp, 34.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PSerif("Personvern", 26.sp)
            Text("De andre ser at delingen er pauset eller av. Posisjoner lagres i 7 dager, helse i 30 dager.", color = p.mut, fontSize = 13.sp)
            PLabel("Deling")
            PCard {
                PRow("Del posisjonen", "Også i bakgrunnen, med varsel i statuslinjen", if (me?.sharing == "on") "✓" else "", p.pos, serif = false) { startSharing() }
                PRow("Pause", "De andre ser «Pause»", if (me?.sharing == "paused") "✓" else "", p.pos, serif = false, top = true) { vm.famSetSharing("paused") }
                PRow("Slå av", "Ingen posisjon deles", if (me?.sharing == "off") "✓" else "", p.pos, serif = false, top = true) { vm.famSetSharing("off") }
            }
            PLabel("Hvor nøyaktig")
            PCard {
                PRow("Nøyaktig", "GPS, ned til noen meter", if (me?.precision != "approx") "✓" else "", p.pos, serif = false) { vm.famSetPrecision("exact") }
                PRow("Omtrentlig", "Rundet av til ca. 1 km, uten fart", if (me?.precision == "approx") "✓" else "", p.pos, serif = false, top = true) { vm.famSetPrecision("approx") }
            }
            PLabel("Helse (Health Connect)")
            when (hcStatus) {
                2 -> Text("Health Connect finnes ikke på denne telefonen.", color = p.mut, fontSize = 13.sp)
                1 -> Text("Health Connect må installeres eller oppdateres fra Play Butikk.", color = p.lab, fontSize = 13.sp)
                else -> {
                    PCard {
                        HEALTH_KEYS.forEachIndexed { i, (k, n) ->
                            PToggle(n, null, k in health, top = i > 0) { on -> health = if (on) health + k else health - k }
                        }
                    }
                    PButton("Lagre helsedeling", Modifier.fillMaxWidth()) {
                        val perms = HealthSync.permissionsFor(health)
                        if (perms.isEmpty()) vm.famSetHealth(health) else hcPerm.launch(perms)
                    }
                    Text("Bare det du velger, sendes til serveren, som et sammendrag hvert 15. minutt.", color = p.mut, fontSize = 12.sp)
                }
            }
        }
    }
}

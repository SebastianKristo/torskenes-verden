@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package no.kristo.finanshub.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import no.kristo.finanshub.*
import no.kristo.finanshub.family.FamilyService
import no.kristo.finanshub.family.HealthSync
import org.json.JSONObject
import java.net.URLEncoder
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/*
 * Prompt 22: Familie nøyaktig etter design/Familie.dc.html (og claude-code-familie-design.md), likt med iOS.
 * Mål i dp = px i designet (390 px bredde). Egne komponenter, ingen Material-kort eller listestil.
 *  - Topp: samme toppbilde som resten av appen, «‹ Hjem», profilbilde, «Posisjon, soner og helse» og «Familie».
 *  - Fanelinje nederst: Kart ◎ · Soner ◌ · Helse ♡ · Mer ⋯, ingen skann-knapp.
 *  - Verktøyrad over kartet, kartet (420, radius 24) med soner, pins, zoom og «Sanntid».
 *  - Kart: personkort, familien, hendelser og «Min deling». Soner: redigering i kortet. Helse: kilder og per person.
 */

/* ---------------- Ikoner og farger fra designet (ZIC, ZPAL, ZC) ---------------- */

/** Nøkkel, navn og SVG-bane (24 × 24, strek). Samme baner som designet, så iOS og Android blir identiske. */
internal val FAM22_ICONS: List<Triple<String, String, String>> = listOf(
    Triple("home", "Hjem", "M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"),
    Triple("work", "Jobb", "M4 8h16v11H4zM9 8V5h6v3M4 13h16"),
    Triple("school", "Skole", "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5"),
    Triple("heart", "Familie", "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"),
    Triple("cabin", "Hytte", "M3 20h18M5 20V11l7-6 7 6v9M10 20v-5h4v5"),
    Triple("gym", "Trening", "M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"),
    Triple("shop", "Butikk", "M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0"),
    Triple("ball", "Sport", "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18"),
    Triple("coffee", "Kafé", "M5 9h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M11 3v3"),
    Triple("tree", "Natur", "M12 3l6 9h-4l4 6H6l4-6H6zM12 18v3"),
    Triple("plane", "Reise", "M2 13l20-8-6 16-3-7-7-1z"),
    Triple("star", "Favoritt", "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"),
    Triple("pin", "Sted", "M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"),
)

internal fun fam22IconPath(key: String): String = FAM22_ICONS.firstOrNull { it.first == key }?.third ?: FAM22_ICONS.last().third

/** De 10 forhåndsvalgte sonefargene (ZPAL). */
private val FAM22_PAL = listOf("#b23a2a", "#d9662a", "#d9a400", "#2f7a4f", "#2e6f75", "#2b5d8a", "#5b4bb5", "#7a3b6b", "#c2417a", "#5c5850")

/** Farge for en ny sone, etter hvor mange som finnes (ZC). */
private val FAM22_ZC = listOf("#b23a2a", "#2b5d8a", "#2f6b45", "#a8661a", "#7a3b6b")

/** Standardikon etter navn: Hjem → home, Jobb → work, Skole → school, Mormor → heart, Hytte → cabin, ellers pin. */
private fun fam22DefaultIcon(name: String): String = when (name.trim()) {
    "Hjem" -> "home"; "Jobb" -> "work"; "Skole" -> "school"; "Mormor" -> "heart"; "Hytta", "Hytte" -> "cabin"; else -> "pin"
}

private fun fam22Hex(c: Long): String = String.format("#%06x", c and 0xFFFFFF)

/** Ikonet lagres lokalt også, så det vises selv om serveren (eldre versjon) ikke sender «icon». */
private object Fam22IconPrefs {
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("fam22", Context.MODE_PRIVATE)
    fun get(ctx: Context, acc: String?, zoneId: String): String? = runCatching { prefs(ctx).getString("icon_${acc}_$zoneId", null) }.getOrNull()
    fun put(ctx: Context, acc: String?, zoneId: String, icon: String) { runCatching { prefs(ctx).edit().putString("icon_${acc}_$zoneId", icon).apply() } }
}

private fun fam22ZoneIcon(ctx: Context, acc: String?, z: FamZone): String {
    val k = z.icon ?: Fam22IconPrefs.get(ctx, acc, z.id) ?: fam22DefaultIcon(z.name)
    return if (FAM22_ICONS.any { it.first == k }) k else fam22DefaultIcon(z.name)
}

/** Ny sone som ikke er lagret ennå. */
private data class Fam22Draft(val name: String, val lat: Double, val lon: Double, val r: Double, val color: String, val icon: String?, val shared: Boolean)

/* ---------------- Små hjelpere ---------------- */

private fun fam22Ago(iso: String?, cap: Boolean): String {
    val t = runCatching { Instant.parse(iso!!) }.getOrNull() ?: return "–"
    val m = Duration.between(t, Instant.now()).toMinutes()
    return when { m < 1 -> if (cap) "Nå" else "nå"; m < 60 -> "$m min siden"; m < 60 * 24 -> "${Math.round(m / 60.0)} t siden"; else -> "${m / 1440} d siden" }
}

private fun fam22AgeMin(iso: String?): Long? = runCatching { Duration.between(Instant.parse(iso!!), Instant.now()).toMinutes() }.getOrNull()

private fun fam22Kmh(speed: Double?): Double = (speed ?: 0.0) * 3.6

private fun fam22KmhText(v: Double): String = if (v >= 10) "${Math.round(v)}" else String.format("%.1f", v).replace('.', ',').removeSuffix(",0")

private fun fam22Radius(r: Double): String = if (r >= 1000) String.format("%.1f", r / 1000).replace('.', ',') + " km" else "${Math.round(r)} m"

private fun fam22InZone(zones: List<FamZone>, lat: Double, lon: Double): FamZone? {
    val d = FloatArray(1)
    return zones.firstOrNull { z -> android.location.Location.distanceBetween(lat, lon, z.lat, z.lon, d); d[0] <= z.radius }
}

private fun fam22Where(zones: List<FamZone>, m: FamMember): String {
    if (m.sharing == "paused") return "Deling er satt på pause"
    if (m.sharing != "on") return "Deler ikke posisjon"
    val l = m.last ?: return "Ingen posisjon ennå"
    val v = fam22Kmh(l.speed)
    val z = fam22InZone(zones, l.lat, l.lon)
    val base = z?.let { "I ${it.name}" } ?: l.place?.takeIf { it.isNotBlank() }?.let { "I $it" }
        ?: if (v > 1.5 || (l.activity != null && l.activity != "still")) activityText(l.activity) else "Ukjent sted"
    return base + if (v > 1.0) " · ${fam22KmhText(v)} km/t" else ""
}

private fun fam22Battery(l: FamPos?): String = l?.battery?.let { "$it %" + if (l.charging == true) " ⚡" else "" } ?: "–"

private fun fam22Api(vm: AppViewModel) = Api(vm.base, vm.account?.token)

/** Bildet beskjæres til kvadrat og skaleres til 160 × 160 (JPEG 82), med EXIF-rotasjon. */
private fun fam22Square160(data: ByteArray): ByteArray? = runCatching {
    val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(data, 0, data.size, o)
    var sample = 1
    while (minOf(o.outWidth, o.outHeight) / (sample * 2) >= 320) sample *= 2
    val bmp = BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
    val rot = runCatching {
        when (android.media.ExifInterface(java.io.ByteArrayInputStream(data)).getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, 1)) {
            6 -> 90f; 3 -> 180f; 8 -> 270f; else -> 0f
        }
    }.getOrDefault(0f)
    val side = minOf(bmp.width, bmp.height)
    val mx = android.graphics.Matrix().apply { postScale(160f / side, 160f / side); if (rot != 0f) postRotate(rot) }
    val out = Bitmap.createBitmap(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, mx, true)
    java.io.ByteArrayOutputStream().also { out.compress(Bitmap.CompressFormat.JPEG, 82, it) }.toByteArray()
}.getOrNull()

/** Lokal reserve når serveren ikke har /api/family/photo (404): bildet lagres på telefonen, per konto og person. */
private fun fam22LocalPhoto(ctx: Context, acc: String?, userId: String): java.io.File =
    java.io.File(java.io.File(ctx.filesDir, "fam22-photos").apply { mkdirs() }, "${acc ?: "x"}-${userId.replace(Regex("[^A-Za-z0-9_-]"), "_")}.jpg")

/* ---------------- Tekst i designets fonter ---------------- */

@Composable
private fun Fam22Text(
    text: String, size: TextUnit, color: Color, weight: FontWeight = FontWeight.Normal, family: FontFamily = PaperFonts.sans,
    modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE, lineHeight: TextUnit = TextUnit.Unspecified, align: TextAlign? = null,
    italic: Boolean = false, spacing: TextUnit = TextUnit.Unspecified, shadow: Shadow? = null,
) = Text(
    text, modifier, color = color, fontSize = size, fontWeight = weight, fontFamily = family, fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal,
    lineHeight = lineHeight, maxLines = maxLines, overflow = TextOverflow.Ellipsis, textAlign = align, letterSpacing = spacing,
    style = if (shadow != null) TextStyle(shadow = shadow) else TextStyle.Default,
)

/** Etikett: IBM Plex Mono 600, 10,5, sperring 0,12 em, lab. */
@Composable
private fun Fam22Label(text: String) {
    Fam22Text(text, 10.5.sp, PaperPal.current.lab, FontWeight.SemiBold, PaperFonts.mono, Modifier.padding(horizontal = 4.dp), maxLines = 1, spacing = 1.26.sp)
}

/** Ikonet fra designet med strek (round cap/join) i en boks på size × size. */
@Composable
private fun Fam22Icon(key: String, size: Dp, stroke: Float, color: Color) {
    val path = remember(key) { runCatching { PathParser().parsePathString(fam22IconPath(key)).toPath() }.getOrNull() }
    Canvas(Modifier.size(size)) {
        val pth = path ?: return@Canvas
        val k = this.size.minDimension / 24f
        withTransform({ scale(k, k, pivot = Offset.Zero) }) {
            drawPath(pth, color, style = Stroke(width = stroke, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

/** Rund avatar: bilde (beskåret), ellers to bokstaver (Manrope 800, hvit) på personens farge. */
@Composable
private fun Fam22Avatar(photo: Bitmap?, color: Color, initials: String, size: Dp, font: TextUnit, modifier: Modifier = Modifier) {
    Box(modifier.size(size).clip(CircleShape).background(color), contentAlignment = Alignment.Center) {
        if (photo != null) Image(photo.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        else Fam22Text(initials, font, Color.White, FontWeight.ExtraBold, maxLines = 1)
    }
}

/* ---------------- Skjermen ---------------- */

/**
 * Familie (prompt 22). startSharing ber om posisjonstillatelse og slår på deling; askLocation ber bare om tillatelsen.
 * Personvern og helsevalg (Health Connect) ligger fortsatt i arket fra Family16 (vm.famPrivacy).
 */
@Composable
internal fun Family22Screen(vm: AppViewModel, startSharing: () -> Unit, askLocation: () -> Unit) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val clip = LocalClipboardManager.current
    val f = vm.family
    val acc = vm.account?.id
    val meId = f?.me?.userId
    val tab = vm.famTab.takeIf { it in setOf("kart", "soner", "helse") } ?: "kart"
    val ctl = remember { Fam22MapCtl() }

    var placing by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf<Fam22Draft?>(null) }
    var zEd by remember { mutableStateOf<String?>(null) }
    var cardOpen by remember { mutableStateOf(false) }
    var rmArm by remember { mutableStateOf<String?>(null) }
    var photoFor by remember { mutableStateOf<String?>(null) }
    var photoVer by remember { mutableIntStateOf(0) }
    var colorDlg by remember { mutableStateOf<Pair<String, (String) -> Unit>?>(null) }
    val zEdits = remember { mutableStateMapOf<String, FamZone>() }
    val jobs = remember { HashMap<String, Job>() }
    var fitted by remember { mutableStateOf(false) }

    BackHandler {
        when {
            colorDlg != null -> colorDlg = null
            placing -> placing = false
            draft != null -> draft = null
            zEd != null -> zEd = null
            cardOpen -> cardOpen = false
            else -> vm.closeFamily()
        }
    }

    val members = f?.members ?: emptyList()
    val zones = (f?.zones ?: emptyList()).map { zEdits[it.id] ?: it }
    fun colorOf(m: FamMember): Long = m.color ?: vm.famColor(m.userId)
    fun firstName(m: FamMember) = m.name.split(' ').first()

    // Profilbilder: lokal reserve (404 på eldre server) → photoUrl (seerens valg) → avatarUrl → initialer.
    val photoKeys = members.map { it.userId to (it.photoUrl ?: it.avatarUrl) }
    val photos by produceState(emptyMap<String, Bitmap>(), photoKeys, photoVer) {
        val out = HashMap(value)
        for ((id, path) in photoKeys) {
            val local = fam22LocalPhoto(ctx, acc, id)
            val b = if (local.exists()) withContext(Dispatchers.IO) { runCatching { BitmapFactory.decodeFile(local.path) }.getOrNull() }
            else if (!path.isNullOrBlank() && path.startsWith("/")) vm.image(path) else null
            if (b != null) out[id] = b else out.remove(id)
            value = HashMap(out)
        }
    }

    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        val target = photoFor
        photoFor = null
        if (uri != null && target != null) vm.viewModelScope.launch {
            val jpeg = withContext(Dispatchers.IO) { runCatching { ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes() } }.getOrNull() }
                ?.let { withContext(Dispatchers.Default) { fam22Square160(it) } }
            if (jpeg == null) { vm.message = "Kunne ikke lese bildet"; return@launch }
            val local = fam22LocalPhoto(ctx, acc, target)
            try {
                val b64 = android.util.Base64.encodeToString(jpeg, android.util.Base64.NO_WRAP)
                fam22Api(vm).request("PUT", "/family/photo/" + URLEncoder.encode(target, "UTF-8"),
                    JSONObject().put("image", "data:image/jpeg;base64,$b64"), prefix = Api.HOMELAB, timeout = 15_000)
                runCatching { local.delete() }
                vm.loadFamily().join()
                vm.flash("Profilbilde lagret")
            } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) {
                // Eldre server (404) eller ingen nett: bildet brukes bare på denne telefonen.
                withContext(Dispatchers.IO) { runCatching { local.writeBytes(jpeg) } }
                vm.flash("Profilbilde lagret på denne telefonen")
            }
            photoVer++
        }
    }
    val pickFor: (String) -> Unit = { id ->
        photoFor = id
        runCatching { pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
    }

    /* ----- Lagring av soner (umiddelbart; navn etter 600 ms pause) ----- */
    fun zoneBody(name: String, lat: Double, lon: Double, r: Double, color: String, icon: String, shared: Boolean) =
        JSONObject().put("name", name.trim().ifBlank { "Sone" }).put("lat", lat).put("lon", lon).put("radius", r).put("color", color.lowercase())
            .put("icon", icon).put("shared", shared)

    fun editZone(z: FamZone, wait: Boolean) {
        zEdits[z.id] = z
        jobs[z.id]?.cancel()
        jobs[z.id] = scope.launch {
            if (wait) delay(600)
            val icon = fam22ZoneIcon(ctx, acc, z)
            try {
                fam22Api(vm).request("PATCH", "/family/zones/" + URLEncoder.encode(z.id, "UTF-8"),
                    zoneBody(z.name, z.lat, z.lon, z.radius, fam22Hex(z.color), icon, z.shared), prefix = Api.HOMELAB)
                Fam22IconPrefs.put(ctx, acc, z.id, icon)
                vm.loadFamily().join()
                if (zEdits[z.id] == z) zEdits.remove(z.id)
            } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: ApiException) {
                vm.message = e.message
                if (zEdits[z.id] == z) zEdits.remove(z.id)
            } catch (e: Exception) { vm.message = "Kunne ikke lagre sonen" }
        }
    }

    fun saveDraft(d: Fam22Draft) = scope.launch {
        val name = d.name.trim().ifBlank { "Sone ${zones.size + 1}" }
        val icon = d.icon ?: fam22DefaultIcon(name)
        try {
            val r = fam22Api(vm).request("POST", "/family/zones", zoneBody(name, d.lat, d.lon, d.r, d.color, icon, d.shared), prefix = Api.HOMELAB)
            runCatching { JSONObject(r).let { o -> o.optJSONObject("zone")?.optString("id")?.takeIf { it.isNotBlank() } ?: o.optString("id").takeIf { it.isNotBlank() } } }
                .getOrNull()?.let { Fam22IconPrefs.put(ctx, acc, it, icon) }
            draft = null
            vm.loadFamily().join()
            vm.flash("$name er lagret")
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: ApiException) { vm.message = e.message } catch (e: Exception) { vm.message = "Kunne ikke lagre sonen" }
    }

    /* ----- Kartdata ----- */
    val selId = vm.famSel
    val sharingMembers = members.filter { it.sharing == "on" && it.last?.let { l -> validLatLon(l.lat, l.lon) } == true }
    val mapData = Fam22MapData(
        zones = zones.map { z -> Fam22ZoneDraw(z.id, z.name, z.lat, z.lon, z.radius, z.color.toInt(), fam22ZoneIcon(ctx, acc, z), false) } +
            listOfNotNull(draft?.let { d -> Fam22ZoneDraw("draft", d.name.ifBlank { "Ny sone" }, d.lat, d.lon, d.r, color(d.color).toInt(), d.icon ?: fam22DefaultIcon(d.name), true) }),
        pins = sharingMembers.map { m ->
            val l = m.last!!
            val v = fam22Kmh(l.speed)
            Fam22PinDraw(m.userId, l.lat, l.lon, colorOf(m).toInt(), if (m.userId == meId) "Du" else m.name.take(2), photos[m.userId],
                cardOpen && selId == m.userId, if (v > 1.0) "${Math.round(v)}" else null)
        },
        trail = vm.famTrack.filter { validLatLon(it.lat, it.lon) }.map { it.lat to it.lon }.takeLast(60),
        trailColor = (members.firstOrNull { it.userId == selId }?.let { colorOf(it) } ?: 0xFFB23A2A).toInt(),
        placing = placing,
    )
    val pick: (String) -> Unit = { id ->
        vm.famSelect(id)
        cardOpen = true
        members.firstOrNull { it.userId == id }?.last?.let { ctl.pick(it.lat, it.lon) }
    }
    val fitAll: () -> Unit = { ctl.fit(sharingMembers.map { it.last!!.lat to it.last.lon }) }
    LaunchedEffect(f != null, sharingMembers.size) {
        if (f != null && !fitted && sharingMembers.isNotEmpty()) { delay(150); fitAll(); fitted = true }
    }

    val navInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val barBottom = maxOf(12.dp, navInset - 8.dp)

    Box(Modifier.fillMaxSize().background(p.bg)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            Fam22Hero(vm)
            Column(
                Modifier.fillMaxWidth().offset(y = (-23).dp).padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                vm.familyError?.let { e -> Fam22Text(e, 13.sp, p.lab, modifier = Modifier.padding(horizontal = 4.dp)) }
                if (tab != "helse") {
                    Fam22Toolbar(placing, { placing = !placing; draft = null }, fitAll) {
                        scope.launch { vm.loadFamily().join(); vm.flash("Posisjoner oppdatert") }
                    }
                    Box(Modifier.fillMaxWidth().height(420.dp).clip(RoundedCornerShape(24.dp)).background(Color(0xFFE9E5DC))) {
                        FamilyMapSafe(vm, Modifier.matchParentSize(), mapData, ctl, onPin = pick) { la, lo ->
                            placing = false
                            draft = Fam22Draft("", la, lo, 200.0, FAM22_ZC[zones.size % FAM22_ZC.size], null, false)
                            // Skjemaet for ny sone ligger i Soner (som i designet); vi går dit med en gang.
                            vm.famTab = "soner"
                        }
                        if (placing) Box(
                            Modifier.align(Alignment.TopCenter).padding(12.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color(0xFF1B1A17)).padding(14.dp, 10.dp),
                            contentAlignment = Alignment.Center,
                        ) { Fam22Text("Trykk på kartet der sonen skal være", 13.sp, Color.White, FontWeight.SemiBold, align = TextAlign.Center) }
                        Column(Modifier.align(Alignment.BottomEnd).padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Fam22MapBtn("+", 20.sp, "Zoom inn") { ctl.zoomIn() }
                            Fam22MapBtn("−", 20.sp, "Zoom ut") { ctl.zoomOut() }
                            Fam22MapBtn("◎", 15.sp, "Vis alle") { fitAll() }
                        }
                        val live = f?.me?.sharing == "on"
                        Row(
                            Modifier.align(Alignment.BottomStart).padding(10.dp).clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = .92f)).padding(10.dp, 6.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Box(Modifier.size(8.dp).clip(CircleShape).background(if (live) Color(0xFF2F7A4F) else Color(0xFFD9A400)))
                            Fam22Text(if (live) "Sanntid · din GPS er på" else "Sanntid · du deler ikke", 11.sp, Color(0xFF1B1A17), FontWeight.SemiBold, maxLines = 1)
                        }
                    }
                }
                if (f == null && vm.familyError == null) Fam22Text("Henter familien …", 13.sp, p.mut, modifier = Modifier.padding(horizontal = 4.dp))
                when (tab) {
                    "kart" -> {
                        val sel = members.firstOrNull { it.userId == selId }
                        if (cardOpen && sel != null) Fam22PersonCard(vm, sel, sel.userId == meId, colorOf(sel), photos[sel.userId], zones,
                            onPhoto = { pickFor(sel.userId) }, onClose = { cardOpen = false },
                            onShareLink = { url -> clip.setText(AnnotatedString(url)); vm.flash("Lenke kopiert") })
                        if (f != null && members.none { it.userId != meId && it.sharing == "on" }) Fam22Nobody()
                        if (members.isNotEmpty()) Fam22People(members, meId, zones, photos, ::colorOf) { m -> if (m.sharing == "on" && m.last != null) pick(m.userId) }
                        if (f != null) Fam22Events(f, ::colorOf)
                        f?.me?.let { me -> Fam22MySharing(vm, me, startSharing, askLocation) }
                    }
                    "soner" -> {
                        draft?.let { d ->
                            Fam22DraftCard(d, { draft = it }, { draft = null }, { nd -> saveDraft(nd) }) { cur, set -> colorDlg = cur to set }
                        }
                        if (f != null && zones.isEmpty() && draft == null) Fam22Text("Ingen soner ennå. Trykk «+ Ny sone på kartet» og velg et sted, f.eks. Hjem eller Skole.",
                            13.sp, p.mut, modifier = Modifier.padding(horizontal = 4.dp))
                        zones.forEach { z ->
                            Fam22ZoneCard(
                                z, fam22ZoneIcon(ctx, acc, z), members, meId, photos, ::colorOf, zEd == z.id,
                                onShow = { ctl.showZone(z.lat, z.lon, z.radius, 420f) },
                                onEdit = { zEd = if (zEd == z.id) null else z.id },
                                onRemove = {
                                    if (rmArm != z.id) {
                                        rmArm = z.id
                                        vm.flash("Trykk igjen for å slette ${z.name}")
                                        scope.launch { delay(2500); if (rmArm == z.id) rmArm = null }
                                    } else { rmArm = null; zEd = null; vm.famDeleteZone(z.id); vm.flash("${z.name} er slettet") }
                                },
                                onChange = { nz, wait -> editZone(nz, wait) },
                                onIcon = { k -> Fam22IconPrefs.put(ctx, acc, z.id, k); editZone(z.copy(icon = k), false) },
                                onNotify = { uid, on -> vm.famZoneNotify(z.id, uid, on, on) },
                                onCustomColor = { cur, set -> colorDlg = cur to set },
                            )
                        }
                        Fam22Text("Trykk på en person i en sone for å slå varsel av eller på når de kommer og går.", 12.sp, p.mut,
                            modifier = Modifier.padding(horizontal = 4.dp), lineHeight = 17.4.sp)
                    }
                    else -> Fam22Health(vm, members, meId, photos, ::colorOf)
                }
            }
            Spacer(Modifier.height(PAPER_BAR + barBottom + 4.dp))
        }
        Fam22TabBar(vm, tab, Modifier.align(Alignment.BottomCenter).padding(start = 12.dp, end = 12.dp, bottom = barBottom))
        vm.message?.let { t ->
            Box(
                Modifier.align(Alignment.BottomCenter).padding(bottom = barBottom + 98.dp, start = 24.dp, end = 24.dp)
                    .shadow(12.dp, RoundedCornerShape(20.dp)).clip(RoundedCornerShape(20.dp)).background(p.ink).padding(18.dp, 11.dp),
            ) { Fam22Text(t, 14.sp, p.bg, FontWeight.SemiBold, maxLines = 2, align = TextAlign.Center) }
        }
    }
    colorDlg?.let { (cur, set) -> Fam22ColorDialog(cur, { set(it); colorDlg = null }) { colorDlg = null } }
}

/* ---------------- Toppen ---------------- */

/** Samme toppbilde som resten av appen: «‹ Hjem» (mørk glass-pille), profilbilde, kursiv undertittel 17 og tittel 40. */
@Composable
private fun Fam22Hero(vm: AppViewModel) {
    val bmp: Bitmap? = if (vm.photoKind == "cur" || vm.photoKind == "none") null else vm.photo
    val fg = bgForeground(vm, bmp != null)
    val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val sh = Shadow(Color.Black.copy(alpha = .35f), Offset(0f, 2f), 14f)
    Box(Modifier.fillMaxWidth().height(140.dp + statusTop).background(Brush.verticalGradient(*HERO_FALLBACK))) {
        BgLayer(vm, bmp)
        Column(Modifier.fillMaxSize().padding(top = statusTop + 8.dp, start = 22.dp, end = 22.dp, bottom = 34.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.height(34.dp).clip(CircleShape).background(Color(0x8C1B1A17)).clickable(onClickLabel = "Tilbake til Hjem") { vm.closeFamily() }
                        .padding(start = 10.dp, end = 14.dp),
                    contentAlignment = Alignment.Center,
                ) { Fam22Text("‹ Hjem", 13.sp, Color.White, FontWeight.SemiBold, maxLines = 1) }
                Spacer(Modifier.weight(1f))
                Box(
                    Modifier.size(38.dp).clip(CircleShape).background(Color(0xFFF3EFE6)).clickable(onClickLabel = "Innstillinger") { vm.closeFamily(); vm.openPaperPage("set") }
                        .semantics { contentDescription = "Innstillinger" },
                    contentAlignment = Alignment.Center,
                ) { AvatarImage(vm, 38, Color(0xFFF3EFE6), Color(0xFF1B1A17)) }
            }
            Spacer(Modifier.weight(1f))
            Fam22Text("Posisjon, soner og helse", 17.sp, fg.copy(alpha = .9f), FontWeight.Normal, PaperFonts.serif, maxLines = 1, italic = true, shadow = sh)
            Spacer(Modifier.height(4.dp))
            Fam22Text("Familie", 40.sp, fg, FontWeight.Medium, PaperFonts.serif, maxLines = 1, lineHeight = 40.sp, shadow = sh)
        }
    }
}

/* ---------------- Fanelinja ---------------- */

/** Kart ◎ · Soner ◌ · Helse ♡ · Mer ⋯: flytende svart pille, valgt fane er lys pille med ikon og tekst. Ingen skann-knapp. */
@Composable
private fun Fam22TabBar(vm: AppViewModel, tab: String, modifier: Modifier) {
    val p = PaperPal.current
    Row(
        modifier.fillMaxWidth().height(62.dp).shadow(16.dp, CircleShape).clip(CircleShape).background(p.nav).padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        listOf(Triple("kart", "Kart", "◎"), Triple("soner", "Soner", "◌"), Triple("helse", "Helse", "♡"), Triple("mer", "Mer", "⋯")).forEach { (k, n, ic) ->
            // Prompt 24 (A): felles fane (Mer24.kt) med 7 dp mellomrom og tekst uten fontpadding.
            PaperTab24(n, ic, tab == k, p.navInk, p.navActInk, p.navAct, serif = true) {
                Haptics.select()
                if (k == "mer") { vm.closeFamily(); vm.paperTab("mer") } else vm.famTab = k
            }
        }
    }
}

/* ---------------- Verktøyrad og kartknapper ---------------- */

@Composable
private fun Fam22Toolbar(placing: Boolean, onPlace: () -> Unit, onFit: () -> Unit, onRefresh: () -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(
            Modifier.height(42.dp).clip(RoundedCornerShape(21.dp)).background(p.ink).clickable(role = Role.Button, onClick = onPlace).padding(horizontal = 18.dp),
            contentAlignment = Alignment.Center,
        ) { Fam22Text(if (placing) "Avbryt plassering" else "+ Ny sone på kartet", 14.sp, p.bg, FontWeight.Bold, maxLines = 1) }
        Spacer(Modifier.weight(1f))
        Box(
            Modifier.height(42.dp).clip(RoundedCornerShape(21.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(21.dp))
                .clickable(role = Role.Button, onClick = onFit).padding(horizontal = 18.dp),
            contentAlignment = Alignment.Center,
        ) { Fam22Text("Vis alle", 14.sp, p.ink, FontWeight.Bold, maxLines = 1) }
        Box(
            Modifier.size(42.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape)
                .clickable(role = Role.Button, onClickLabel = "Oppdater", onClick = onRefresh),
            contentAlignment = Alignment.Center,
        ) { Fam22Refresh(p.ink) }
    }
}

/** ↻ fra designet: «M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5», 18 dp, strek 2,2. */
@Composable
private fun Fam22Refresh(color: Color) {
    val path = remember { PathParser().parsePathString("M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5").toPath() }
    Canvas(Modifier.size(18.dp)) {
        val k = size.minDimension / 24f
        withTransform({ scale(k, k, pivot = Offset.Zero) }) { drawPath(path, color, style = Stroke(2.2f, cap = StrokeCap.Round, join = StrokeJoin.Round)) }
    }
}

@Composable
private fun Fam22MapBtn(label: String, size: TextUnit, desc: String, onClick: () -> Unit) {
    Box(
        Modifier.size(40.dp).shadow(6.dp, RoundedCornerShape(12.dp), ambientColor = Color.Black.copy(alpha = .18f), spotColor = Color.Black.copy(alpha = .18f))
            .clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = .95f)).clickable(role = Role.Button, onClickLabel = desc, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Fam22Text(label, size, Color(0xFF1B1A17), maxLines = 1) }
}

/* ---------------- Kart-fanen ---------------- */

/** Personkortet: avatar 48 (trykk = bytt bilde, ✎), navn Newsreader 22, sted og tid, ×, seks sensorruter og to knapper. */
@Composable
private fun Fam22PersonCard(
    vm: AppViewModel, m: FamMember, isMe: Boolean, color: Long, photo: Bitmap?, zones: List<FamZone>,
    onPhoto: () -> Unit, onClose: () -> Unit, onShareLink: (String) -> Unit,
) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val l = m.last
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(48.dp).clickable(onClickLabel = "Bytt profilbilde", onClick = onPhoto)) {
                Fam22Avatar(photo, Color(color), m.name.take(2), 48.dp, 16.sp)
                Box(
                    Modifier.align(Alignment.BottomEnd).offset(3.dp, 3.dp).size(20.dp).clip(CircleShape).background(p.card).padding(2.dp).clip(CircleShape).background(p.ink),
                    contentAlignment = Alignment.Center,
                ) { Fam22Text("✎", 11.sp, p.bg, maxLines = 1, lineHeight = 11.sp) }
            }
            Column(Modifier.weight(1f)) {
                Fam22Text(if (isMe) "Deg" else m.name, 22.sp, p.ink, FontWeight.Medium, PaperFonts.serif, maxLines = 1, lineHeight = 24.2.sp)
                Fam22Text(fam22Where(zones, m) + (l?.let { " · oppdatert " + fam22Ago(it.ts, false) } ?: ""), 12.5.sp, p.mut, maxLines = 2)
            }
            Box(
                Modifier.size(36.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(role = Role.Button, onClickLabel = "Lukk", onClick = onClose),
                contentAlignment = Alignment.Center,
            ) { Fam22Text("×", 16.sp, p.ink, maxLines = 1) }
        }
        if (l != null && m.sharing == "on") {
            val v = fam22Kmh(l.speed)
            val tiles = listOf(
                Triple("Batteri", fam22Battery(l), (l.battery ?: 100) < 20),
                Triple("Aktivitet", activityText(l.activity), false),
                Triple("Fart", "${fam22KmhText(v)} km/t", false),
                Triple("Nøyaktighet", l.acc?.let { "± ${Math.round(it)} m" } ?: if (m.precision == "approx") "ca. 1 km" else "–", false),
                Triple("Enhet", l.device ?: "–", false),
                Triple("Koordinater", String.format(java.util.Locale.US, "%.4f, %.4f", l.lat, l.lon), false),
            )
            tiles.chunked(3).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { (lab, value, warn) ->
                        Column(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(p.bg).padding(10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Fam22Text(lab, 11.sp, p.mut, maxLines = 1)
                            Fam22Text(value, 14.sp, if (warn) p.lab else p.ink, FontWeight.SemiBold, PaperFonts.mono, maxLines = 1)
                        }
                    }
                }
            }
            // Prompt 24: enhetene under sensorrutene; trykk velger kilde (bare for deg selv).
            if (m.devices.size > 1 || (isMe && m.devices.isNotEmpty())) Fam24Devices(vm, m, isMe)
            val url = String.format(java.util.Locale.US, "https://www.google.com/maps/dir/?api=1&destination=%.6f,%.6f", l.lat, l.lon)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    Modifier.weight(1f).height(42.dp).clip(RoundedCornerShape(21.dp)).background(p.ink).clickable(role = Role.Button) { openLink(ctx, url) },
                    contentAlignment = Alignment.Center,
                ) { Fam22Text("Veibeskrivelse", 13.5.sp, p.bg, FontWeight.Bold, maxLines = 1) }
                Box(
                    Modifier.weight(1f).height(42.dp).clip(RoundedCornerShape(21.dp)).border(1.dp, p.line, RoundedCornerShape(21.dp))
                        .clickable(role = Role.Button) { if (isMe) onShareLink(url) else vm.famPing(m.userId, m.name.split(' ').first()) },
                    contentAlignment = Alignment.Center,
                ) { Fam22Text(if (isMe) "Del min posisjon" else "Spill av lyd", 13.5.sp, p.ink, FontWeight.Bold, maxLines = 1) }
            }
        } else {
            val first = m.name.split(' ').first()
            Fam22Text(when (m.sharing) { "paused" -> "$first har satt delingen på pause."; "on" -> "Ingen posisjon ennå."; else -> "$first deler ikke posisjonen." }, 13.sp, p.mut)
        }
    }
}

/** Tom tilstand: deling er av som standard, så ingen ser hverandre før de selv slår det på. */
@Composable
private fun Fam22Nobody() {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Fam22Text("Ingen deler posisjon med deg ennå", 15.sp, p.ink, FontWeight.Bold)
        Fam22Text("Deling er av som standard. Du ser bare dem som selv har slått på deling, og de ser deg bare når du deler.", 12.5.sp, p.mut, lineHeight = 18.sp)
    }
}

/** Familien: avatar 42 med statusprikk (grønn fersk / gul > 15 min / grå av), navn 15/700, sted 12,5, batteri til høyre. */
@Composable
private fun Fam22People(
    members: List<FamMember>, meId: String?, zones: List<FamZone>, photos: Map<String, Bitmap>, colorOf: (FamMember) -> Long, onPick: (FamMember) -> Unit,
) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(horizontal = 16.dp, vertical = 4.dp)) {
        members.forEachIndexed { i, m ->
            val l = m.last
            val ok = m.sharing == "on"
            val age = fam22AgeMin(l?.ts)
            val dot = when { !ok || l == null -> Color(0xFF9A9488); age != null && age <= 15 -> Color(0xFF2F7A4F); else -> Color(0xFFD9A400) }
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Row(
                Modifier.fillMaxWidth().clickable { onPick(m) }.padding(vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(Modifier.size(42.dp)) {
                    Fam22Avatar(photos[m.userId], Color(colorOf(m)), m.name.take(2), 42.dp, 14.sp)
                    Box(Modifier.align(Alignment.BottomEnd).offset(1.dp, 1.dp).size(12.dp).clip(CircleShape).background(p.card).padding(2.dp).clip(CircleShape).background(dot))
                }
                Column(Modifier.weight(1f)) {
                    Fam22Text(if (m.userId == meId) "${m.name} (deg)" else m.name, 15.sp, p.ink, FontWeight.Bold, maxLines = 1)
                    // Prompt 24: én person = én oppføring, også med flere enheter («Hjem · 2 enheter»).
                    Fam22Text(fam22Where(zones, m) + fam24DevicesSuffix(m), 12.5.sp, p.mut, maxLines = 1)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Fam22Text(fam22Battery(l), 12.5.sp, if ((l?.battery ?: 100) < 20) p.lab else p.ink, FontWeight.SemiBold, PaperFonts.mono, maxLines = 1)
                    Fam22Text(if (ok) fam22Ago(l?.ts, true) else "–", 11.5.sp, p.mut, maxLines = 1)
                }
            }
        }
    }
}

/** HENDELSER: prikk i personens farge, tekst 13,5 og klokkeslett (Plex Mono 12). */
@Composable
private fun Fam22Events(f: Family, colorOf: (FamMember) -> Long) {
    val p = PaperPal.current
    val fmt = remember { DateTimeFormatter.ofPattern("HH:mm") }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Fam22Label("HENDELSER")
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(horizontal = 16.dp, vertical = 4.dp)) {
            if (f.events.isEmpty()) Fam22Text("Ingen hendelser ennå.", 13.5.sp, p.mut, modifier = Modifier.padding(vertical = 10.dp))
            f.events.take(6).forEachIndexed { i, e ->
                val m = f.members.firstOrNull { it.userId == e.userId }
                val who = m?.name?.split(' ')?.firstOrNull() ?: "Noen"
                val zone = e.zoneName ?: f.zones.firstOrNull { it.id == e.zoneId }?.name ?: "sonen"
                val at = runCatching { Instant.parse(e.ts!!).atZone(ZoneId.systemDefault()).format(fmt) }.getOrDefault("")
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(m?.let { Color(colorOf(it)) } ?: p.mut))
                    Fam22Text(if (e.kind == "leave") "$who forlot $zone" else "$who kom til $zone", 13.5.sp, p.ink, modifier = Modifier.weight(1f), maxLines = 1)
                    Fam22Text(at, 12.sp, p.mut, FontWeight.Medium, PaperFonts.mono, maxLines = 1)
                }
            }
        }
    }
}

/** «Min deling»: Del min posisjon, Presisjon og Sensorer fra mobilen. */
@Composable
private fun Fam22MySharing(vm: AppViewModel, me: FamMe, startSharing: () -> Unit, askLocation: () -> Unit) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val gps = remember(me.sharing) { FamilyService.hasLocation(ctx) }
    val rows = listOf(
        listOf("Del min posisjon",
            when (me.sharing) { "on" -> "Familien ser hvor du er"; "paused" -> "Pauset · de andre ser at du har pauset"; else -> "Av som standard · trykk for å dele" },
            when (me.sharing) { "on" -> "På"; "paused" -> "Pauset"; else -> "Av" }),
        listOf("Presisjon", if (me.precision == "approx") "Omtrentlig, rundt 1 km" else "Nøyaktig punkt", (if (me.precision == "approx") "Omtrentlig" else "Nøyaktig") + " ›"),
        listOf("Sensorer fra mobilen", "Batteri, aktivitet og fart", if (gps) "GPS på" else "Be om tilgang ›"),
    )
    val colors = listOf(if (me.sharing == "on") p.pos else p.lab, p.mut, if (gps) p.pos else p.lab)
    val actions = listOf<() -> Unit>(
        { if (me.sharing == "on") vm.famSetSharing("paused") else startSharing() },
        { vm.famSetPrecision(if (me.precision == "approx") "exact" else "approx") },
        { if (gps) vm.flash("GPS er på") else askLocation() },
    )
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Fam22Text("Min deling", 20.sp, p.ink, FontWeight.Medium, PaperFonts.serif, maxLines = 1)
        Column {
            rows.forEachIndexed { i, r ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(
                    Modifier.fillMaxWidth().clickable(onClick = actions[i]).padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Column(Modifier.weight(1f)) {
                        Fam22Text(r[0], 14.sp, p.ink, FontWeight.Bold, maxLines = 1)
                        Fam22Text(r[1], 12.sp, p.mut, maxLines = 2)
                    }
                    Fam22Text(r[2], 13.sp, colors[i], FontWeight.Bold, maxLines = 1)
                }
            }
        }
        Fam22Text("Deling er av til hver enkelt slår den på i appen. Hver person kan pause eller slå av når som helst, og de andre ser det.",
            12.sp, p.mut, lineHeight = 17.4.sp)
    }
}

/* ---------------- Soner-fanen ---------------- */

/** Rutenett med 13 ikoner (auto-fill, minst [min] dp brede, 6 dp mellomrom). Valgt: fylt i sonefargen, hvitt ikon. */
@Composable
private fun Fam22IconGrid(selected: String, accent: Color, min: Dp, iconSize: Dp, onPick: (String) -> Unit) {
    val p = PaperPal.current
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val cols = maxOf(1, ((maxWidth + 6.dp) / (min + 6.dp)).toInt())
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            FAM22_ICONS.chunked(cols).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    row.forEach { (k, n, _) ->
                        val on = k == selected
                        Box(
                            Modifier.weight(1f).height(min).clip(RoundedCornerShape(12.dp)).background(if (on) accent else Color.Transparent)
                                .border(2.dp, if (on) accent else p.line, RoundedCornerShape(12.dp))
                                .clickable(role = Role.Button, onClickLabel = n) { onPick(k) }.semantics { contentDescription = n },
                            contentAlignment = Alignment.Center,
                        ) { Fam22Icon(k, iconSize, 1.9f, if (on) Color.White else p.ink) }
                    }
                    repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

/** 10 farger og regnbuerunding (fri fargevelger), med hex i Plex Mono. Ytre 3 dp kant (valgt = ink), 2 dp ring i kortfarge. */
@Composable
private fun Fam22ColorRow(cur: String, size: Dp, onPick: (String) -> Unit, onCustom: () -> Unit) {
    val p = PaperPal.current
    val custom = FAM22_PAL.none { it.equals(cur, true) }
    @Composable
    fun Swatch(sel: Boolean, fill: (Modifier) -> Modifier, desc: String, onClick: () -> Unit) {
        Box(
            Modifier.size(size).clip(CircleShape).then(fill(Modifier)).clickable(role = Role.Button, onClickLabel = desc, onClick = onClick)
                .semantics { contentDescription = desc },
        ) {
            Box(Modifier.matchParentSize().border(3.dp, if (sel) p.ink else Color.Transparent, CircleShape))
            Box(Modifier.matchParentSize().padding(3.dp).border(2.dp, p.card, CircleShape))
        }
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        FAM22_PAL.forEach { c -> Swatch(c.equals(cur, true), { it.background(Color(color(c))) }, "Farge $c") { onPick(c) } }
        Swatch(custom, { m ->
            m.drawBehind {
                rotate(-90f) {
                    drawCircle(Brush.sweepGradient(listOf(Color(0xFFFF4444), Color(0xFFFFDD00), Color(0xFF44CC44), Color(0xFF00CCFF), Color(0xFF4444FF), Color(0xFFCC44FF), Color(0xFFFF4444))))
                }
            }
        }, "Velg egen farge", onCustom)
        Box(Modifier.height(size), contentAlignment = Alignment.Center) { Fam22Text(cur.lowercase(), 12.sp, p.mut, FontWeight.SemiBold, PaperFonts.mono, maxLines = 1) }
    }
}

@Composable
private fun Fam22Slider(value: Float, accent: Color, onChange: (Float) -> Unit, onDone: () -> Unit) {
    val p = PaperPal.current
    Slider(
        value, onChange, Modifier.fillMaxWidth().height(28.dp), valueRange = 50f..2000f, steps = 77, onValueChangeFinished = onDone,
        colors = SliderDefaults.colors(thumbColor = accent, activeTrackColor = accent, inactiveTrackColor = p.line, activeTickColor = Color.Transparent, inactiveTickColor = Color.Transparent),
    )
}

@Composable
private fun Fam22Field(value: String, onChange: (String) -> Unit, height: Dp, radius: Dp, pad: Dp, size: TextUnit, placeholder: String?) {
    val p = PaperPal.current
    BasicTextField(
        value, onChange, singleLine = true,
        textStyle = TextStyle(color = p.ink, fontSize = size, fontWeight = FontWeight.SemiBold, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.lab),
        modifier = Modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(radius)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(radius)),
        decorationBox = { inner ->
            Box(Modifier.fillMaxSize().padding(horizontal = pad), contentAlignment = Alignment.CenterStart) {
                if (value.isEmpty() && placeholder != null) Fam22Text(placeholder, size, p.mut, FontWeight.SemiBold, maxLines = 1)
                inner()
            }
        },
    )
}

/** Av/på for deling av sonen (brukerskille: sonen er privat til eieren deler den). */
@Composable
private fun Fam22SharedRow(on: Boolean, onChange: (Boolean) -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().clickable { onChange(!on) }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Fam22Text("Del med familien", 13.sp, p.ink, FontWeight.SemiBold, maxLines = 1)
            Fam22Text(if (on) "Alle i familien ser sonen" else "Bare du ser sonen", 12.sp, p.mut, maxLines = 1)
        }
        Box(Modifier.size(42.dp, 24.dp).clip(CircleShape).background(if (on) p.pos else p.line).padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
            Box(Modifier.size(18.dp).clip(CircleShape).background(Color.White))
        }
    }
}

/** «Ny sone»: kant 1,5 lab, navn, radius, ikon, farge og Avbryt / Lagre sone. */
@Composable
private fun Fam22DraftCard(d: Fam22Draft, onChange: (Fam22Draft) -> Unit, onCancel: () -> Unit, onSave: (Fam22Draft) -> Unit, onCustom: (String, (String) -> Unit) -> Unit) {
    val p = PaperPal.current
    var r by remember(d.lat, d.lon) { mutableFloatStateOf(d.r.toFloat()) }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).border(1.5.dp, p.lab, RoundedCornerShape(22.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Fam22Text("Ny sone", 20.sp, p.ink, FontWeight.Medium, PaperFonts.serif, maxLines = 1)
        Fam22Field(d.name, { onChange(d.copy(name = it)) }, 44.dp, 14.dp, 14.dp, 15.sp, "Navn, f.eks. Trening")
        Row(Modifier.fillMaxWidth()) {
            Fam22Text("Radius", 13.sp, p.mut, modifier = Modifier.weight(1f))
            Fam22Text(fam22Radius(r.toDouble()), 13.sp, p.ink, FontWeight.SemiBold, PaperFonts.mono)
        }
        Fam22Slider(r, Color(0xFFB23A2A), { r = it }) { onChange(d.copy(r = r.toDouble())) }
        Fam22Text("Ikon", 13.sp, p.mut)
        Fam22IconGrid(d.icon ?: fam22DefaultIcon(d.name), Color(color(d.color)), 40.dp, 20.dp) { onChange(d.copy(icon = it)) }
        Fam22Text("Farge", 13.sp, p.mut)
        Fam22ColorRow(d.color, 32.dp, { onChange(d.copy(color = it)) }) { onCustom(d.color) { c -> onChange(d.copy(color = c)) } }
        Fam22SharedRow(d.shared) { onChange(d.copy(shared = it)) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, p.line, RoundedCornerShape(22.dp)).clickable(role = Role.Button, onClick = onCancel),
                contentAlignment = Alignment.Center,
            ) { Fam22Text("Avbryt", 14.sp, p.ink, FontWeight.Bold, maxLines = 1) }
            Box(
                Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).background(p.ink).clickable(role = Role.Button) { onSave(d.copy(r = r.toDouble())) },
                contentAlignment = Alignment.Center,
            ) { Fam22Text("Lagre sone", 14.sp, p.bg, FontWeight.Bold, maxLines = 1) }
        }
    }
}

/** Sonekort: ikon i fylt sirkel 42, navn + «radius · hvem er der nå», ✎ og −, redigering i kortet og personchips for varsel. */
@Composable
private fun Fam22ZoneCard(
    z: FamZone, icon: String, members: List<FamMember>, meId: String?, photos: Map<String, Bitmap>, colorOf: (FamMember) -> Long, editing: Boolean,
    onShow: () -> Unit, onEdit: () -> Unit, onRemove: () -> Unit, onChange: (FamZone, Boolean) -> Unit, onIcon: (String) -> Unit,
    onNotify: (String, Boolean) -> Unit, onCustomColor: (String, (String) -> Unit) -> Unit,
) {
    val p = PaperPal.current
    val zc = Color(z.color)
    val here = members.filter { m -> m.sharing == "on" && m.last?.let { l -> fam22InZone(listOf(z), l.lat, l.lon) != null } == true }
        .joinToString(", ") { if (it.userId == meId) "deg" else it.name.split(' ').first() }.ifBlank { "ingen der nå" }
    val owner = if (!z.mine) " · delt av ${z.ownerName ?: members.firstOrNull { it.userId == z.owner }?.name?.split(' ')?.first() ?: "familien"}" else ""
    var r by remember(z.id, z.radius) { mutableFloatStateOf(z.radius.toFloat()) }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(42.dp).clip(CircleShape).background(zc).clickable(role = Role.Button, onClickLabel = "Vis på kartet", onClick = onShow), contentAlignment = Alignment.Center) {
                Fam22Icon(icon, 21.dp, 2f, Color.White)
            }
            Column(Modifier.weight(1f)) {
                Fam22Text(z.name, 15.sp, p.ink, FontWeight.Bold, maxLines = 1)
                Fam22Text("${fam22Radius(r.toDouble())} radius · $here$owner", 12.5.sp, p.mut, maxLines = 2)
            }
            if (z.mine) {
                Box(
                    Modifier.size(34.dp).clip(CircleShape).background(if (editing) p.bg else Color.Transparent).border(1.dp, p.line, CircleShape)
                        .clickable(role = Role.Button, onClickLabel = "Rediger sone", onClick = onEdit),
                    contentAlignment = Alignment.Center,
                ) { Fam22Text("✎", 14.sp, p.ink, maxLines = 1) }
                Box(Modifier.size(34.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Slett sone", onClick = onRemove), contentAlignment = Alignment.Center) {
                    Fam22Text("−", 20.sp, p.lab, maxLines = 1)
                }
            }
        }
        if (editing && z.mine) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Column(Modifier.padding(top = 0.dp, bottom = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Fam22Field(z.name, { onChange(z.copy(name = it), true) }, 40.dp, 12.dp, 12.dp, 14.sp, null)
                Fam22IconGrid(icon, zc, 38.dp, 19.dp, onIcon)
                Fam22ColorRow(fam22Hex(z.color), 30.dp, { onChange(z.copy(color = color(it)), false) }) {
                    onCustomColor(fam22Hex(z.color)) { c -> onChange(z.copy(color = color(c)), false) }
                }
                Row(Modifier.fillMaxWidth()) {
                    Fam22Text("Radius", 13.sp, p.mut, modifier = Modifier.weight(1f))
                    Fam22Text(fam22Radius(r.toDouble()), 13.sp, p.ink, FontWeight.SemiBold, PaperFonts.mono)
                }
                Fam22Slider(r, zc, { r = it }) { onChange(z.copy(radius = r.toDouble()), false) }
                Fam22SharedRow(z.shared) { onChange(z.copy(shared = it), false) }
            }
        }
        val others = members.filter { it.userId != meId }
        if (others.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                others.forEach { m ->
                    val cur = z.notify[m.userId]
                    val on = cur != null && (cur.first || cur.second)
                    val first = m.name.split(' ').first()
                    Row(
                        Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).background(if (on) p.bg else Color.Transparent)
                            .border(1.dp, if (on) p.ink else p.line, RoundedCornerShape(16.dp)).clickable { onNotify(m.userId, !on) }.padding(start = 4.dp, end = 10.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Fam22Avatar(photos[m.userId], Color(colorOf(m)), m.name.take(2), 24.dp, 10.sp)
                        Fam22Text(if (on) "$first · varsel på" else first, 12.sp, p.ink, FontWeight.SemiBold, maxLines = 1)
                    }
                }
            }
        }
    }
}

/** Fri fargevelger: metning/lysstyrke-felt, fargetone-stripe og hex. Brukes av regnbuerundingen. */
@Composable
private fun Fam22ColorDialog(initial: String, onPick: (String) -> Unit, onDismiss: () -> Unit) {
    val p = PaperPal.current
    val hsv0 = remember(initial) { FloatArray(3).also { android.graphics.Color.colorToHSV(color(initial).toInt(), it) } }
    var h by remember { mutableFloatStateOf(hsv0[0]) }
    var s by remember { mutableFloatStateOf(hsv0[1]) }
    var v by remember { mutableFloatStateOf(hsv0[2]) }
    val argb = android.graphics.Color.HSVToColor(floatArrayOf(h, s, v))
    val hex = String.format("#%06x", argb and 0xFFFFFF)
    var text by remember(hex) { mutableStateOf(hex) }
    Dialog(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Fam22Text("Velg egen farge", 20.sp, p.ink, FontWeight.Medium, PaperFonts.serif)
            val hue = Color(android.graphics.Color.HSVToColor(floatArrayOf(h, 1f, 1f)))
            var svSize by remember { mutableStateOf(Size.Zero) }
            Box(
                Modifier.fillMaxWidth().height(170.dp).clip(RoundedCornerShape(14.dp))
                    .drawBehind {
                        svSize = size
                        drawRect(Brush.horizontalGradient(listOf(Color.White, hue)))
                        drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color.Black)))
                        drawCircle(Color.White, 9.dp.toPx(), Offset(s * size.width, (1 - v) * size.height), style = Stroke(2.5.dp.toPx()))
                    }
                    .pointerInput(Unit) {
                        fun set(o: Offset) { if (svSize.width > 0) { s = (o.x / svSize.width).coerceIn(0f, 1f); v = (1 - o.y / svSize.height).coerceIn(0f, 1f) } }
                        detectTapGestures { set(it) }
                    }
                    .pointerInput("drag") {
                        detectDragGestures { ch, _ -> if (svSize.width > 0) { s = (ch.position.x / svSize.width).coerceIn(0f, 1f); v = (1 - ch.position.y / svSize.height).coerceIn(0f, 1f) } }
                    },
            )
            var hueW by remember { mutableFloatStateOf(0f) }
            Box(
                Modifier.fillMaxWidth().height(24.dp).clip(CircleShape)
                    .drawBehind {
                        hueW = size.width
                        drawRect(Brush.horizontalGradient((0..6).map { Color(android.graphics.Color.HSVToColor(floatArrayOf(it * 60f, 1f, 1f))) }))
                        drawCircle(Color.White, size.height / 2 - 2.dp.toPx(), Offset((h / 360f) * size.width, size.height / 2), style = Stroke(2.5.dp.toPx()))
                    }
                    .pointerInput(Unit) { detectTapGestures { o -> if (hueW > 0) h = (o.x / hueW * 360f).coerceIn(0f, 359.9f) } }
                    .pointerInput("drag") { detectDragGestures { ch, _ -> if (hueW > 0) h = (ch.position.x / hueW * 360f).coerceIn(0f, 359.9f) } },
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(32.dp).clip(CircleShape).background(Color(argb)))
                Box(Modifier.weight(1f)) {
                    Fam22Field(text, { t ->
                        text = t
                        if (Regex("#?[0-9a-fA-F]{6}").matches(t)) {
                            val hs = FloatArray(3)
                            android.graphics.Color.colorToHSV(color("#" + t.removePrefix("#")).toInt(), hs)
                            h = hs[0]; s = hs[1]; v = hs[2]
                        }
                    }, 40.dp, 12.dp, 12.dp, 14.sp, "#rrggbb")
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, p.line, RoundedCornerShape(22.dp)).clickable(role = Role.Button, onClick = onDismiss),
                    contentAlignment = Alignment.Center,
                ) { Fam22Text("Avbryt", 14.sp, p.ink, FontWeight.Bold, maxLines = 1) }
                Box(
                    Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).background(p.ink).clickable(role = Role.Button) { onPick(hex) },
                    contentAlignment = Alignment.Center,
                ) { Fam22Text("Bruk farge", 14.sp, p.bg, FontWeight.Bold, maxLines = 1) }
            }
        }
    }
}

/* ---------------- Helse-fanen ---------------- */

private fun fam22IsApple(m: FamMember): Boolean = m.last?.device?.let { it.contains("iPhone", true) || it.contains("iPad", true) } == true

@Composable
private fun Fam22Health(vm: AppViewModel, members: List<FamMember>, meId: String?, photos: Map<String, Bitmap>, colorOf: (FamMember) -> Long) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    // Health Connect-oppslag går utenfor hovedtråden (prompt 20).
    val st by produceState(2) { value = HealthSync.statusIo(ctx) }
    val myShare = vm.family?.me?.shareHealth?.any { it.value } == true
    val appleOn = members.any { fam22IsApple(it) && it.health != null }
    val hcOn = st == 0 && myShare
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(
            listOf("Apple Health", "♥", "iPhone"),
            listOf("Health Connect", "✚", "Android"),
        ).forEachIndexed { i, (n, ic, dv) ->
            val on = if (i == 0) appleOn else hcOn
            val c = if (i == 0) Color(0xFFE0245E) else Color(0xFF3B6FD6)
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(20.dp)).background(p.card).border(1.5.dp, if (on) p.pos else p.line, RoundedCornerShape(20.dp))
                    .clickable {
                        if (i == 1) vm.famPrivacy = true else vm.flash("Åpne Homelab-appen på iPhone for å godkjenne Apple Health")
                    }.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(Modifier.size(36.dp).clip(RoundedCornerShape(11.dp)).background(c), contentAlignment = Alignment.Center) { Fam22Text(ic, 18.sp, Color.White, maxLines = 1) }
                Fam22Text(n, 14.sp, p.ink, FontWeight.Bold, maxLines = 1)
                Fam22Text(if (on) "Koblet til via appen · $dv" else "Ikke koblet til · trykk for å koble", 12.sp, if (on) p.pos else p.mut, maxLines = 2)
            }
        }
    }
    members.forEach { m ->
        val h = m.health
        val on = h != null
        val src = if (fam22IsApple(m)) "Apple Health" else "Health Connect"
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Fam22Avatar(photos[m.userId], Color(colorOf(m)), m.name.take(2), 40.dp, 13.sp)
                Column(Modifier.weight(1f)) {
                    Fam22Text(if (m.userId == meId) "${m.name} (deg)" else m.name, 15.sp, p.ink, FontWeight.Bold, maxLines = 1)
                    Fam22Text("$src · " + if (on) "synket " + fam22Ago(h?.updatedAt, false).let { if (it == "–") "i dag" else it } else "ikke synket", 12.sp, p.mut, maxLines = 1)
                }
                Box(Modifier.clip(RoundedCornerShape(10.dp)).background(p.bg).padding(10.dp, 4.dp)) {
                    Fam22Text(if (on) "Deler" else "Deler ikke", 11.5.sp, if (on) p.pos else p.mut, FontWeight.Bold, maxLines = 1)
                }
            }
            if (h != null) {
                val goal = 10_000
                val steps = h.steps ?: 0
                val pc = Color(colorOf(m))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Canvas(Modifier.size(64.dp)) {
                        val k = size.minDimension / 64f
                        val r = 26 * k
                        val tl = Offset(center.x - r, center.y - r)
                        drawCircle(p.line, r, style = Stroke(7 * k))
                        drawArc(pc, -90f, 360f * (steps.toFloat() / goal).coerceIn(0f, 1f), false, tl, Size(r * 2, r * 2), style = Stroke(7 * k, cap = StrokeCap.Round))
                    }
                    Column(Modifier.weight(1f)) {
                        Fam22Text(n0(steps.toDouble()), 28.sp, p.ink, FontWeight.Medium, PaperFonts.serif, maxLines = 1, lineHeight = 28.sp)
                        Fam22Text("skritt · mål ${n0(goal.toDouble())}", 12.5.sp, p.mut, maxLines = 1)
                    }
                }
                val tiles = listOf(
                    Triple("Hvilepuls", h.restingHr?.let { "$it bpm" } ?: "–", "Snitt siste 7 dager"),
                    Triple("Puls nå", h.hr?.let { "$it bpm" } ?: "–", "Fra klokken"),
                    Triple("Søvn i natt", h.sleepMin?.let { "${it / 60} t ${it % 60} m" } ?: "–", "Mål 8 t"),
                    Triple("Aktive kalorier", h.activeKcal?.let { n0(it.toDouble()) + " kcal" } ?: "–", "I dag"),
                )
                tiles.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { (l, v, sub) ->
                            Column(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(p.bg).padding(12.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Fam22Text(l, 11.5.sp, p.mut, maxLines = 1)
                                Fam22Text(v, 15.sp, p.ink, FontWeight.SemiBold, PaperFonts.mono, maxLines = 1)
                                Fam22Text(sub, 11.sp, p.mut, maxLines = 1)
                            }
                        }
                    }
                }
                val week = h.week.takeLast(7).map { it.steps ?: 0 }
                if (week.isNotEmpty()) {
                    val mx = (week.maxOrNull() ?: 1).coerceAtLeast(1)
                    Row(Modifier.fillMaxWidth().height(44.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.Bottom) {
                        week.forEachIndexed { i, s ->
                            Box(Modifier.weight(1f).fillMaxHeight(maxOf(8f, s.toFloat() / mx * 100f) / 100f).clip(RoundedCornerShape(4.dp))
                                .background(if (i == week.size - 1) pc else pc.copy(alpha = 0x55 / 255f)))
                        }
                    }
                }
            } else {
                Fam22Text("Deler ikke helsedata. ${m.name.split(' ').first()} kan slå det på i sin app.", 13.sp, p.mut)
            }
        }
    }
    Fam22Text(
        "Apple Health og Health Connect kan bare leses av appen på telefonen. Homelab-appen sender et sammendrag hit hvert 15. minutt, og bare det personen har valgt å dele.",
        12.sp, p.mut, modifier = Modifier.padding(horizontal = 4.dp), lineHeight = 17.4.sp,
    )
}

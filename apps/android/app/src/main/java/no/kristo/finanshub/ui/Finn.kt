package no.kristo.finanshub.ui

import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

/*
 * Finn-handler (design 2a): egen fane i Finans. Listen har netto i år, «på vei»-kort med sporing,
 * filter og et rutenett; handelen har bilder, status, kvittering, annonse, bilder og en tidslinje.
 */

private val nbLocale = Locale("nb", "NO")
private val buyC: Color get() = tc(0xFF8FB3FF)
private val sellC: Color get() = tc(0xFF7BE3A0)
private val dim: Color get() = tc(0xFF3A3A44)

private fun FinnDeal.col() = if (sold) sellC else buyC
private fun FinnDeal.roleName() = if (sold) "Solgt" else "Kjøpt"
private fun FinnDeal.valueText() = (if (sold) "+" else "−") + n0(amount) + " kr"
private fun initials(s: String) = s.split(Regex("\\s+")).filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }.ifEmpty { "•" }
/** Fast fargetone per handel når det ikke finnes bilde. */
private fun tint(id: Int): Color = listOf(0xFF3A2F4A, 0xFF1E2A3F, 0xFF3B2E22, 0xFF22362C, 0xFF2C2C33, 0xFF2A3540).let { tc(it[Math.floorMod(id, it.size)]) }

/** «2026-10-14» eller «14.10.2026» → sorterbar nøkkel. */
private fun sortKey(d: String?): String {
    if (d == null) return ""
    Regex("^(\\d{4})-(\\d{2})-(\\d{2})").find(d)?.let { return it.value }
    Regex("^(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{2,4}))?").find(d)?.let { m ->
        val y = m.groupValues[3].ifEmpty { "${LocalDate.now().year}" }.let { if (it.length == 2) "20$it" else it }
        return "$y-${m.groupValues[2].padStart(2, '0')}-${m.groupValues[1].padStart(2, '0')}"
    }
    return d
}

/** Bilde fra serveren (relativ sti, hentes med appens token). Uten bilde vises fargetone og initialer. */
@Composable
private fun FinnImage(vm: AppViewModel, path: String?, id: Int, label: String, modifier: Modifier, iniSize: Int = 32) {
    var bmp by remember(path) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(path) { bmp = if (path != null && path.startsWith("/")) vm.image(path) else null }
    Box(modifier.background(tint(id)), contentAlignment = Alignment.Center) {
        val b = bmp
        if (b != null) Image(b.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        else Text(initials(label), fontSize = iniSize.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = .2f))
    }
}

/** Fire sporingspunkter: Betalt → Sendt → Mottatt → Godkjent (kjøp) eller Solgt → Sendt → Levert → Utbetalt (salg). */
@Composable
private fun TrackPoints(d: FinnDeal, big: Boolean = false) {
    val lvl = d.level
    val fin = d.finished
    Row(Modifier.fillMaxWidth()) {
        d.points.forEachIndexed { j, t ->
            val done = j < lvl
            val cur = j == lvl - 1 && !fin
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(if (big) 8.dp else 7.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val dot = if (big) 14.dp else 12.dp
                    Box(Modifier.size(dot).clip(CircleShape).background(if (done) (if (cur) C.accent else C.text) else dim)
                        .then(if (cur) Modifier.border(3.dp, C.accent.copy(alpha = .35f), CircleShape) else Modifier))
                    Box(Modifier.weight(1f).height(if (big) 3.dp else 2.dp).background(if (j == 3) Color.Transparent else if (j + 1 < lvl) C.text else dim))
                }
                Text(t, fontSize = if (big) 11.5.sp else 11.sp, color = if (done) C.text else C.text2.copy(alpha = .6f), fontWeight = if (cur) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1)
            }
        }
    }
}

@Composable
private fun Pill(text: String, bg: Color, fg: Color, modifier: Modifier = Modifier) =
    Text(text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = fg, maxLines = 1, modifier = modifier.clip(RoundedCornerShape(12.dp)).background(bg).padding(10.dp, 4.dp))

/* ---------------- Listen ---------------- */

@Composable
internal fun FinnScreen(vm: AppViewModel) {
    if (vm.finnSel != null) { FinnDealScreen(vm); return }
    val f = vm.finn
    var q by rememberSaveable { mutableStateOf("") }
    var qOpen by rememberSaveable { mutableStateOf(false) }
    var seg by rememberSaveable { mutableStateOf("Alle") }
    Page {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                // Åpnet fra Mer (Finn er skjult som fane): tilbake til Mer.
                if (!vm.finTabShown(Screen.Finn)) FilledTonalIconButton(onClick = { vm.back() }, modifier = Modifier.size(44.dp)) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Tilbake") }
                Text(vm.finName(Screen.Finn), fontSize = 34.sp, fontWeight = FontWeight.Bold, letterSpacing = (-1).sp, modifier = Modifier.weight(1f), maxLines = 1)
                FilledTonalIconButton(onClick = { qOpen = !qOpen; q = "" }, modifier = Modifier.size(44.dp)) { Icon(if (qOpen) Icons.Filled.Close else Icons.Filled.Search, "Søk i handler") }
                if (!LocalTopRow.current) Avatar(vm)
            }
        }
        if (qOpen) item {
            OutlinedTextField(q, { q = it }, placeholder = { Text("Søk i handler") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(23.dp))
        }
        vm.moduleError?.let { e -> item { Empty(e) } }
        if (f == null && vm.moduleError == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) } }
        if (f != null) {
            val vis = f.items.filter { q.isBlank() || "${it.item} ${it.counterpart ?: ""} ${it.code ?: ""}".contains(q.trim(), ignoreCase = true) }
            item { FinnSummary(f) }
            val act = vis.filter { !it.finished }
            if (act.isNotEmpty()) {
                item {
                    Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.Bottom) {
                        Text("${act.size} på vei", fontSize = 20.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        if (act.size > 1) Text("Sveip for flere", fontSize = 13.sp, color = C.text2)
                    }
                }
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(act, key = { it.id }) { d -> OnTheWayCard(vm, d) }
                    }
                }
            }
            item {
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(C.surface1).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    listOf("Alle", "Kjøpt", "Solgt", "Fullført").forEach { n ->
                        val on = seg == n
                        Box(Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(12.dp)).background(if (on) C.text else Color.Transparent).clickable { seg = n }, contentAlignment = Alignment.Center) {
                            Text(n, fontSize = 13.5.sp, fontWeight = FontWeight.Medium, color = if (on) C.bg else C.text2, maxLines = 1)
                        }
                    }
                }
            }
            val grid = vis.filter { when (seg) { "Kjøpt" -> !it.sold; "Solgt" -> it.sold; "Fullført" -> it.finished; else -> true } }
            if (grid.isEmpty()) item { Empty(if (f.items.isEmpty()) "Ingen Finn-handler ennå. De kommer inn fra Finn-e-postene, eller legg dem inn i FinansHub på PC." else "Ingen handler passer.") }
            grid.chunked(2).forEach { row ->
                item(key = "g${row.first().id}") {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        row.forEach { d -> GridCard(vm, d, Modifier.weight(1f)) }
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

/** Netto i år med månedsstolper, og kjøpt/solgt med andelsstolper. */
@Composable
private fun FinnSummary(f: FinnList) {
    val year = LocalDate.now().year
    val inYear = f.items.filter { it.date.startsWith("$year") }
    val net = f.sold - f.bought
    val mx = maxOf(f.bought, f.sold, 1.0)
    val now = LocalDate.now()
    val months = (3 downTo 0).map { k ->
        val m = now.minusMonths(k.toLong())
        val key = "%04d-%02d".format(m.year, m.monthValue)
        m.month.getDisplayName(TextStyle.NARROW, nbLocale).uppercase() to f.items.filter { it.date.startsWith(key) }.sumOf { it.amount }
    }
    val top = months.maxOf { it.second }.coerceAtLeast(1.0)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(C.surface1).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text("Netto i år", fontSize = 14.sp, color = C.text2)
                Text((if (net >= 0) "+" else "−") + n0(net) + " kr", fontSize = 32.sp, fontWeight = FontWeight.SemiBold, fontFamily = Mono, color = if (net >= 0) sellC else C.text, maxLines = 1, softWrap = false)
            }
            Row(Modifier.height(52.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.Bottom) {
                months.forEachIndexed { k, (l, v) ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Box(Modifier.width(12.dp).height((v / top * 30 + 4).dp).clip(RoundedCornerShape(4.dp)).background(if (k == 3) C.accent else C.surface3))
                        Text(l, fontSize = 9.5.sp, color = C.text2)
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf(Triple("Kjøpt · ${inYear.count { !it.sold }}", f.bought, buyC), Triple("Solgt · ${inYear.count { it.sold }}", f.sold, sellC)).forEach { (l, v, c) ->
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(l, fontSize = 12.5.sp, color = C.text2)
                    Text(n0(v) + " kr", fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 1)
                    Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(C.surface3)) {
                        Box(Modifier.fillMaxWidth((v / mx).toFloat().coerceIn(0f, 1f)).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(c))
                    }
                }
            }
        }
    }
}

@Composable
private fun OnTheWayCard(vm: AppViewModel, d: FinnDeal) {
    Column(Modifier.width(262.dp).clip(RoundedCornerShape(26.dp)).background(C.surface1).clickable { vm.openFinn(d.id) }) {
        Box(Modifier.fillMaxWidth().height(132.dp)) {
            FinnImage(vm, d.image, d.id, d.item, Modifier.fillMaxSize(), 42)
            Pill(d.roleName(), Color.Black.copy(alpha = .5f), d.col(), Modifier.align(Alignment.TopStart).padding(12.dp))
            Pill(d.valueText(), Color.Black.copy(alpha = .5f), Color.White, Modifier.align(Alignment.TopEnd).padding(12.dp))
        }
        Column(Modifier.padding(16.dp, 14.dp, 16.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(d.item, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            TrackPoints(d)
            HorizontalDivider(color = C.surface3)
            Text("Neste: ${d.nextText}", fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun GridCard(vm: AppViewModel, d: FinnDeal, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(22.dp)).background(C.surface1).clickable { vm.openFinn(d.id) }) {
        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3f)) {
            FinnImage(vm, d.image, d.id, d.item, Modifier.fillMaxSize())
            Pill(d.status, if (d.finished) Color.Black.copy(alpha = .55f) else C.accent, if (d.finished) Color.White.copy(alpha = .85f) else tc(0xFF1A0C04), Modifier.align(Alignment.TopStart).padding(10.dp))
        }
        Column(Modifier.padding(12.dp, 11.dp, 12.dp, 13.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(d.valueText(), fontFamily = Mono, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = d.col(), maxLines = 1)
            Text(d.item, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${d.roleName()} · ${ddmm(d.date)}", fontSize = 12.sp, color = C.text2, maxLines = 1)
            d.summary?.let { Text(it, fontSize = 11.sp, color = C.text2.copy(alpha = .8f), maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
    }
}

/* ---------------- Handelen ---------------- */

private data class TlEntry(val key: String, val title: String, val sub: String, val date: String?, val body: String?, val mail: Boolean)

@Composable
private fun FinnDealScreen(vm: AppViewModel) {
    val det = vm.finnDetail
    if (det == null) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) }; return }
    val d = det.deal
    val imgs = det.images
    var ix by remember(d.id) { mutableStateOf(0) }
    var open by remember(d.id) { mutableStateOf<String?>(null) }
    var askUrl by remember { mutableStateOf(false) }
    val pickRc = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { vm.finnUpload("receipts", it) }
    val pickImg = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(20)) { vm.finnUpload("photos", it) }
    val pickMail = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { vm.finnUpload("emails", it) }
    val cur = if (imgs.isEmpty()) null else imgs[ix.coerceIn(0, imgs.size - 1)]

    Page {
        // Stort bilde: egne bilder eller annonsens. Trykk for neste.
        item {
            Box(Modifier.fillMaxWidth().height(280.dp).clip(RoundedCornerShape(28.dp)).clickable(enabled = imgs.size > 1) { ix = (ix + 1) % imgs.size }) {
                FinnImage(vm, cur, d.id, d.item, Modifier.fillMaxSize(), 88)
                Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Box(Modifier.size(44.dp).clip(CircleShape).background(Color.Black.copy(alpha = .45f)).clickable { vm.back() }, contentAlignment = Alignment.Center) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Tilbake til Finn", tint = Color.White)
                    }
                    if (imgs.size > 1) Text("${ix + 1} / ${imgs.size}", color = Color.White, fontSize = 13.sp,
                        modifier = Modifier.clip(RoundedCornerShape(22.dp)).background(Color.Black.copy(alpha = .45f)).clickable { ix = (ix + 1) % imgs.size }.padding(14.dp, 12.dp))
                }
                if (imgs.size > 1) Row(Modifier.align(Alignment.BottomStart).padding(16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    repeat(minOf(imgs.size, 8)) { k -> Box(Modifier.width(if (k == ix) 22.dp else 6.dp).height(6.dp).clip(RoundedCornerShape(3.dp)).background(if (k == ix) Color.White else Color.White.copy(alpha = .45f))) }
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Pill("${d.roleName()}${d.code?.let { " · Finn-kode $it" } ?: ""}", d.col().copy(alpha = .14f), d.col())
                Text(d.item, fontSize = 26.sp, fontWeight = FontWeight.SemiBold, lineHeight = 30.sp)
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(listOfNotNull(d.counterpart?.let { (if (d.sold) "Til " else "Fra ") + it.replaceFirst(Regex("^(selger|kjøper)\\s+", RegexOption.IGNORE_CASE), "") }, ddmm(d.date)).joinToString(" · "),
                        fontSize = 14.sp, color = C.text2, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(d.valueText(), fontFamily = Mono, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = d.col(), maxLines = 1, softWrap = false)
                }
            }
        }
        // Statuskort med sporing.
        item {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Brush.linearGradient(listOf(tc(0xFF2A1A10), tc(0xFF1A1210))))
                .border(1.dp, tc(0xFF3A2A20), RoundedCornerShape(24.dp)).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Column {
                    Text("STATUS", fontSize = 13.sp, color = C.accentLight, letterSpacing = 1.sp)
                    Text(d.status, fontSize = 26.sp, fontWeight = FontWeight.SemiBold)
                    Text(if (d.finished) "Alt er i orden, og kvitteringen er lagret." else d.nextText, fontSize = 14.sp, color = C.text2)
                }
                TrackPoints(d, big = true)
            }
        }
        // Kvittering · Annonse · Bilder
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Tile("⎙", "Kvittering", if (vm.finnBusy == "receipts") "Laster opp …" else if (det.receipts.isNotEmpty()) "✓ ${det.receipts.size} lagt ved" else "Legg ved",
                    if (det.receipts.isNotEmpty()) sellC else C.accentLight, Modifier.weight(1f)) { pickRc.launch(arrayOf("application/pdf", "image/*", "message/rfc822", "application/octet-stream")) }
                Tile("▦", "Annonse", if (vm.finnBusy == "ad") "Henter …" else if (det.ad != null) "✓ Lagret" else "✦ Hent fra Finn",
                    if (det.ad != null) sellC else C.accentLight, Modifier.weight(1f)) { if (d.code == null && d.adUrl == null && det.ad?.url == null && det.adUrlGuess == null) askUrl = true else vm.finnFetchAd() }
                Tile("◫", "Bilder", if (vm.finnBusy == "photos") "Laster opp …" else if (det.photos.isNotEmpty()) "${det.photos.size} egne" else "Last opp",
                    C.text2, Modifier.weight(1f)) { pickImg.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
            }
        }
        det.ad?.let { ad ->
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(C.surface1).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(ad.title ?: d.item, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Text(n0(ad.price ?: d.amount) + " kr", fontFamily = Mono, fontSize = 14.sp)
                    }
                    Text(listOfNotNull(ad.place, ad.saved?.let { "lagret ${ddmm(it).takeIf { s -> s != "–" } ?: it}" }).joinToString(" · "), fontSize = 12.5.sp, color = C.text2)
                    ad.description?.let { Text(it, fontSize = 14.sp, lineHeight = 21.sp) }
                }
            }
        }
        if (det.receipts.isNotEmpty()) item {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(C.surface1).padding(14.dp, 4.dp)) {
                det.receipts.forEachIndexed { k, r ->
                    if (k > 0) HorizontalDivider(color = C.surface3)
                    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(C.surface3), contentAlignment = Alignment.Center) {
                            Text(r.name.substringAfterLast('.', "").take(4).uppercase(), fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = C.accentLight)
                        }
                        Text(r.name, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        Box(Modifier.size(32.dp).clip(CircleShape).background(C.surface3).clickable { vm.finnRemove("receipts", r.id) }, contentAlignment = Alignment.Center) { Text("×", color = C.text2) }
                    }
                }
            }
        }
        if (det.photos.isNotEmpty()) item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(det.photos, key = { it.id }) { p ->
                    Box(Modifier.size(72.dp).clip(RoundedCornerShape(14.dp))) {
                        FinnImage(vm, p.thumb ?: p.url, d.id, d.item, Modifier.fillMaxSize(), 14)
                        Box(Modifier.align(Alignment.TopEnd).padding(4.dp).size(22.dp).clip(CircleShape).background(Color.Black.copy(alpha = .55f)).clickable { vm.finnRemove("photos", p.id) }, contentAlignment = Alignment.Center) {
                            Text("×", color = Color.White, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
        // Kvittering i papirstil.
        item {
            val lines = det.lines.ifEmpty { listOf(FinnLine(if (d.sold) "Salgspris" else "Varepris", d.amount)) }
            val total = det.total ?: if (det.lines.isEmpty()) d.amount else lines.sumOf { it.amount }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(tc(0xFFF4F1EA)).padding(20.dp, 18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                val ink = Color(0xFF1C1B19)
                Row { Text("KVITTERING${d.code?.let { " · $it" } ?: ""}", fontFamily = Mono, fontSize = 12.sp, color = Color(0xFF77736B), modifier = Modifier.weight(1f)); Text(d.date.take(10), fontFamily = Mono, fontSize = 12.sp, color = Color(0xFF77736B)) }
                HorizontalDivider(color = Color(0xFFCFC9BD))
                lines.forEach { l -> Row { Text(l.label, fontFamily = Mono, fontSize = 14.sp, color = Color(0xFF55524C), modifier = Modifier.weight(1f)); Text(n0(l.amount) + " kr", fontFamily = Mono, fontSize = 14.sp, color = ink) } }
                HorizontalDivider(color = Color(0xFFCFC9BD))
                Row { Text(det.totalLabel ?: if (d.sold) "Utbetalt" else "Betalt", fontFamily = Mono, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = ink, modifier = Modifier.weight(1f)); Text(n0(total) + " kr", fontFamily = Mono, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = ink) }
            }
        }
        // Tidslinje: fullførte steg og e-postene i handelen, nyeste øverst.
        item {
            val tl = (d.steps.filter { it.done }.mapIndexed { k, s -> TlEntry("s$k", s.t, "Steg fullført", s.date, null, false) } +
                det.emails.map { m -> TlEntry("m${m.id}", m.subject ?: "(uten emne)", m.from ?: "E-post", m.date, m.body ?: m.snippet, true) } +
                (det.shipment?.events ?: emptyList()).mapIndexed { k, e ->
                    TlEntry("t$k", e.status.ifBlank { "Sporing" }, listOfNotNull("Sporing", e.location.ifBlank { null }, if (k == 0) det.shipment?.trackingNo else null).joinToString(" · "),
                        e.at?.let { fmtTime(it, "yyyy-MM-dd") } ?: e.raw.ifBlank { null }, null, false)
                })
                .sortedByDescending { sortKey(it.date) }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(C.surface1).padding(16.dp, 18.dp, 16.dp, 4.dp)) {
                Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Tidslinje", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text(if (vm.finnBusy == "emails") "Legger ved …" else "+ Legg ved e-post", fontSize = 12.5.sp, color = C.accentLight,
                        modifier = Modifier.clickable { pickMail.launch(arrayOf("message/rfc822", "application/octet-stream")) })
                }
                if (tl.isEmpty()) Text("Ingen steg eller e-poster ennå. E-poster fra FINN, Posten og motparten kobles til automatisk.", fontSize = 13.sp, color = C.text2, modifier = Modifier.padding(bottom = 14.dp))
                tl.forEachIndexed { j, e ->
                    Row(Modifier.fillMaxWidth().clickable(enabled = e.body != null) { open = if (open == e.key) null else e.key }, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Column(Modifier.width(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(Modifier.padding(top = 4.dp).size(12.dp).clip(CircleShape).background(if (j == 0) C.accent else if (e.mail) C.bg else C.text)
                                .border(2.dp, if (j == 0) C.accent else if (e.mail) C.outline else C.text, CircleShape))
                            if (j < tl.size - 1) Box(Modifier.padding(vertical = 3.dp).width(2.dp).height(40.dp).background(C.surface3))
                        }
                        Column(Modifier.weight(1f).padding(bottom = 14.dp)) {
                            Row {
                                Text(e.title, fontSize = 14.sp, fontWeight = if (e.mail) FontWeight.Normal else FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                e.date?.let { Text(ddmm(sortKey(it)), fontSize = 12.sp, color = C.text2, fontFamily = Mono) }
                            }
                            Text(e.sub, fontSize = 12.5.sp, color = C.text2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (open == e.key && e.body != null) Text(e.body, fontSize = 13.5.sp, lineHeight = 20.sp,
                                modifier = Modifier.padding(top = 8.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(C.bg).padding(12.dp, 10.dp))
                        }
                    }
                }
            }
        }
        det.summary?.let { s -> item { Text(s, fontSize = 12.5.sp, color = C.text2, modifier = Modifier.padding(start = 8.dp)) } }
    }

    if (askUrl) {
        var url by remember { mutableStateOf("") }
        AlertDialog(onDismissRequest = { askUrl = false }, title = { Text("✦ Hent annonsen") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Lim inn finn.no-lenken. Serveren henter tittel, pris, sted, beskrivelse og alle bildene, og beholder kopien selv om annonsen slettes.", fontSize = 14.sp)
                    OutlinedTextField(url, { url = it }, placeholder = { Text("https://www.finn.no/…") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = { TextButton(onClick = { askUrl = false; vm.finnFetchAd(url) }, enabled = url.isNotBlank()) { Text("Hent") } },
            dismissButton = { TextButton(onClick = { askUrl = false }) { Text("Avbryt") } })
    }
}

@Composable
private fun Tile(icon: String, title: String, sub: String, subColor: Color, modifier: Modifier, onClick: () -> Unit) {
    Column(modifier.clip(RoundedCornerShape(18.dp)).background(C.surface1).clickable(onClick = onClick).padding(12.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(icon, fontSize = 18.sp)
        Text(title, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        Text(sub, fontSize = 12.sp, color = subColor, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

package no.kristo.finanshub.ui

import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Public
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import org.json.JSONObject
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.TextStyle as JTextStyle

/*
 * Prompt 24: Boliger nøyaktig etter Boliger.dc.html (variant mobile, tema papir, hide-title) og claude-code-boliger-lik.md.
 * Bolig-piller (hold inne = «Rediger bolig» i bunnark), fanevelger Oversikt · Utgifter · Tilgang, bolig-kort i boligens
 * farge, fire handlinger, TIL GJENNOMGANG, Kategorier, Historikk, Siste utgifter og «Delt med». Toppbildet følger valgt bolig.
 */

private val NB24 = java.util.Locale("nb", "NO")
private fun kr24(v: Double) = "${n0(v)} kr"
private fun monthName24(m: YearMonth, full: Boolean = true): String =
    m.month.getDisplayName(if (full) JTextStyle.FULL else JTextStyle.SHORT, NB24).removeSuffix(".").replaceFirstChar { it.uppercase() }
private fun ddmm24(iso: String): String = runCatching { LocalDate.parse(iso.take(10)).let { String.format("%02d.%02d.%d", it.dayOfMonth, it.monthValue, it.year) } }.getOrDefault(iso.take(10))

/** Kategorifarger og -tegn som i designet (CATS); ukjente kategorier får serverens farge og «•». */
private val CATS24 = listOf(
    Triple("Strøm", 0xFFD9A400, "⚡"), Triple("Vaktmester", 0xFF2B5D8A, "⌂"), Triple("Hage", 0xFF2F7A4F, "✿"), Triple("Vedlikehold", 0xFFA8661A, "⚒"),
    Triple("Forsikring", 0xFF7A3B6B, "◈"), Triple("Kommunale avgifter", 0xFF4B5563, "▤"), Triple("Annet", 0xFF7A7468, "•"),
)
private fun catColor24(name: String, hex: String?): Color = CATS24.firstOrNull { it.first.equals(name, true) }?.let { Color(it.second) } ?: hex?.let { Color(color(it)) } ?: Color(0xFF7A7468)
private fun catIcon24(name: String): String = CATS24.firstOrNull { it.first.equals(name, true) }?.third ?: "•"
private fun guess24(s: String): String = when {
    Regex("strøm|fjordkraft|tibber|elvia|kwh", RegexOption.IGNORE_CASE).containsMatchIn(s) -> "Strøm"
    Regex("snø|vakt|brøyt", RegexOption.IGNORE_CASE).containsMatchIn(s) -> "Vaktmester"
    Regex("hage|plant|gress|blomst", RegexOption.IGNORE_CASE).containsMatchIn(s) -> "Hage"
    Regex("mal|bygg|jernia|clas|maxbo|obs", RegexOption.IGNORE_CASE).containsMatchIn(s) -> "Vedlikehold"
    Regex("forsikr|gjensidige|if |tryg", RegexOption.IGNORE_CASE).containsMatchIn(s) -> "Forsikring"
    Regex("kommune|renovasjon|felles|sameie", RegexOption.IGNORE_CASE).containsMatchIn(s) -> "Kommunale avgifter"
    else -> "Annet"
}
private fun homeColor24(h: Home24, i: Int): Color = h.color?.let { Color(color(it)) } ?: Color(color(HOME24_COLORS[i % HOME24_COLORS.size]))
private fun roleName24(r: String) = when (r) { "owner" -> "Eier"; "viewer" -> "Kan se"; else -> "Kan redigere" }
private fun roleDesc24(r: String) = when (r) { "owner" -> "Full tilgang, kan invitere og slette"; "viewer" -> "Ser oversikt og kvitteringer"; else -> "Legger til kvitteringer og utgifter" }
private val ROLES24 = listOf("owner", "editor", "viewer")
private val MEMC24 = listOf(0xFFB23A2A, 0xFF2B5D8A, 0xFFA8661A, 0xFF2F6B45, 0xFF7A3B6B, 0xFF3D4652)

/** Mørk gradient over toppbildet (OV i designet). */
private val OV24 = Brush.verticalGradient(0f to Color.Black.copy(alpha = .25f), .35f to Color.Transparent, 1f to Color.Black.copy(alpha = .45f))

private fun Modifier.dashed24(color: Color, radius: Dp, width: Dp = 1.5.dp) = drawBehind {
    val w = width.toPx()
    drawRoundRect(
        color = color, topLeft = Offset(w / 2, w / 2), size = Size(size.width - w, size.height - w), cornerRadius = CornerRadius(radius.toPx()),
        style = Stroke(width = w, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx()))),
    )
}

@Composable
private fun svg24(d: String): ImageVector? = remember(d) {
    Svg23.parse("<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">$d</svg>")
}

/* ---------------- Toppbildet og domene-pillen (brukes fra Hero i Paper.kt) ---------------- */

/** Bakgrunnen til valgt bolig i toppbildet (Strømstad, eget bilde), med krysstoning 200 ms. «Farge» viser vanlig toppbilde. */
@Composable
internal fun BoligHero24(vm: AppViewModel, modifier: Modifier) {
    if (vm.screen != Screen.Folders || vm.paperPage != null || vm.selectedTx != null) return
    val s = vm.b24
    val h = s.homes?.let { l -> l.firstOrNull { it.id == s.cur } ?: l.firstOrNull() } ?: return
    val key = homeBg24(h, vm.b24LocalBg(h.id))
    Crossfade(targetState = h.id to key, animationSpec = tween(200), modifier = modifier, label = "bolig-bg") { (hid, k) ->
        val home = s.homes?.firstOrNull { it.id == hid } ?: h
        Box(Modifier.fillMaxSize()) {
            when {
                k == "preset:stromstad" -> {
                    Image(painterResource(no.kristo.finanshub.R.drawable.bolig_stromstad), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
                    Box(Modifier.matchParentSize().background(OV24))
                }
                k.startsWith("upload:") || k.startsWith("local:") -> {
                    val bmp by produceState<Bitmap?>(vm.b24.bgBitmaps[if (k.startsWith("upload:")) "srv:${home.id}" else "local:${home.id}"], home.id, k) { value = vm.b24BgBitmap(home, k) }
                    bmp?.let {
                        Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
                        Box(Modifier.matchParentSize().background(OV24))
                    }
                }
            }
        }
    }
}

/** Mørk glass-pille i toppbildet på Boliger (bare i profilene): globus, besøk i dag, antall domener og statusprikk. */
@Composable
internal fun DomainPill24(vm: AppViewModel) {
    if (!vm.b24ProfileOn || vm.screen != Screen.Folders || vm.paperPage != null || vm.selectedTx != null) return
    LaunchedEffect(Unit) { vm.b24LoadDomSummary() }
    val d = vm.b24.domSum ?: return
    val dot = when (d.status) { "error" -> Color(0xFFE5484D); "warn" -> Color(0xFFE5B53A); else -> Color(0xFF5FD38A) }
    Row(
        Modifier.padding(start = 8.dp, bottom = 4.dp).clip(CircleShape).background(Color(0x8C1B1A17)).clickable(onClickLabel = "Åpne Domener") { vm.b24OpenDomains() }
            .padding(start = 10.dp, end = 12.dp, top = 7.dp, bottom = 7.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Icon(Icons.Filled.Public, null, tint = Color.White, modifier = Modifier.size(15.dp))
        Column {
            Text(n0(d.visitsToday.toDouble()), color = Color.White, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 15.sp, maxLines = 1)
            Text("besøk i dag · ${d.domains} domener", color = Color.White.copy(alpha = .85f), fontSize = 10.5.sp, lineHeight = 12.sp, maxLines = 1)
        }
        Box(Modifier.size(8.dp).clip(CircleShape).background(dot))
    }
}

/** Undertittel i toppbildet: boligenes navn («Strømstad · Leiligheten»). */
internal fun boligKicker24(vm: AppViewModel): String? = vm.b24.homes?.takeIf { it.isNotEmpty() }?.joinToString(" · ") { it.name }

/* ---------------- Siden ---------------- */

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun PaperBoliger24(vm: AppViewModel, navBottom: Dp, takePhoto: () -> Unit, pickFiles: () -> Unit) {
    val p = PaperPal.current
    val s = vm.b24
    LaunchedEffect(Unit) {
        if (s.homes == null) vm.b24LoadHomes() else s.cur?.let { if (vm.folder?.folder?.id != it) vm.b24OpenHome(it) }
    }
    LaunchedEffect(vm.folder) { vm.b24SyncFolder() }
    val homes = s.homes
    val cur = homes?.let { l -> l.firstOrNull { it.id == s.cur } ?: l.firstOrNull() }
    val d = cur?.let { s.details[it.id] }
    val list = homes ?: emptyList()
    val curIdx = cur?.let { list.indexOf(it) } ?: 0
    val ym = YearMonth.now()
    fun spentOf(id: Int, m: YearMonth = ym): Double = s.details[id]?.entries?.filter { it.status != "ai" && it.date.startsWith(m.toString()) }?.sumOf { kotlin.math.abs(it.amount) } ?: 0.0

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(0.dp, 0.dp, 0.dp, PAPER_BAR + 24.dp + navBottom), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        // Bolig-pillene overlapper toppbildet, vannrett scroll. Hold inne = Rediger bolig.
        item {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 2.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                (homes ?: emptyList()).forEachIndexed { i, h ->
                    val on = h.id == cur?.id
                    Row(
                        Modifier.height(52.dp).clip(RoundedCornerShape(26.dp)).background(if (on) p.ink else p.card).border(1.dp, if (on) p.ink else p.line, RoundedCornerShape(26.dp))
                            .combinedClickable(
                                onClickLabel = "Velg ${h.name}", onLongClickLabel = "Rediger ${h.name}",
                                onLongClick = { Haptics.tap(); if (h.id != cur?.id) vm.b24OpenHome(h.id); s.edit = h.id },
                                onClick = { Haptics.select(); if (h.id != cur?.id) vm.b24OpenHome(h.id) },
                            ).padding(start = 8.dp, end = 16.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Box(Modifier.size(36.dp).clip(CircleShape).background(homeColor24(h, i)), contentAlignment = Alignment.Center) {
                            Text(h.name.take(1), color = Color.White, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 17.sp, maxLines = 1)
                        }
                        Column {
                            Text(h.name, color = if (on) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1, softWrap = false)
                            Text("${kr24(spentOf(h.id))} i ${monthName24(ym, false).lowercase(NB24)}", color = (if (on) p.bg else p.ink).copy(alpha = .75f), fontSize = 11.5.sp, maxLines = 1, softWrap = false)
                        }
                    }
                }
                Box(
                    Modifier.height(52.dp).clip(RoundedCornerShape(26.dp)).dashed24(p.line, 26.dp).clickable(role = Role.Button) { s.newHome = true }.padding(horizontal = 18.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("+ Ny bolig", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1, softWrap = false) }
            }
        }
        if (homes == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
        else if (homes.isEmpty()) item {
            Text("Ingen boliger ennå. Trykk «+ Ny bolig» for å lage den første.", color = p.mut, fontSize = 13.5.sp, modifier = Modifier.padding(horizontal = 20.dp))
        }
        if (cur != null) {
            val rv = d?.entries?.filter { it.status == "review" || it.status == "ai" } ?: emptyList()
            // Fanevelger
            item {
                Row(Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(CircleShape).background(p.card).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    listOf("ov" to "Oversikt", "ex" to (if (rv.isNotEmpty()) "Utgifter · ${d?.entries?.size ?: 0}" else "Utgifter")).forEach { (k, n) ->
                        val on = s.tab == k
                        Box(
                            Modifier.weight(1f).height(38.dp).clip(CircleShape).background(if (on) p.ink else Color.Transparent).clickable(role = Role.Tab) { Haptics.select(); s.tab = k },
                            contentAlignment = Alignment.Center,
                        ) { Text(n, color = if (on) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1, softWrap = false) }
                    }
                }
            }
            if (d == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
            else when (s.tab) {
                "ex" -> item { Box(Modifier.padding(horizontal = 16.dp)) { Expenses24(vm, d) } }
                // Prompt 47 (claude-code-boliger-mobil-uten-epost-tilgang.md): Tilgang er ikke en fane lenger, men åpnes fra Rediger bolig → «Delt med N».
                "acc" -> {
                    item { Box(Modifier.padding(horizontal = 16.dp)) { BackToOverview47(vm) } }
                    item { Box(Modifier.padding(horizontal = 16.dp)) { Access24(vm, d, list.size) } }
                }
                else -> {
                    item { Box(Modifier.padding(horizontal = 16.dp)) { HomeCard24(d, homeColor24(cur, curIdx), spentOf(cur.id), spentOf(cur.id, ym.minusMonths(1)), ym) } }
                    item { Box(Modifier.padding(horizontal = 16.dp)) { Actions24(vm, cur.id, takePhoto, pickFiles) } }
                    if (rv.isNotEmpty()) item { Box(Modifier.padding(horizontal = 16.dp)) { Review24(vm, d, rv) } }
                    item { Box(Modifier.padding(horizontal = 16.dp)) { Categories24(vm, d, ym) } }
                    item { Box(Modifier.padding(horizontal = 16.dp)) { History24(d, homeColor24(cur, curIdx), ym) } }
                    item { Box(Modifier.padding(horizontal = 16.dp)) { Recent24(vm, d) } }
                }
            }
        }
    }

    s.edit?.let { id -> list.firstOrNull { it.id == id }?.let { h -> EditHomeSheet24(vm, h, list.indexOf(h), list.size) } }
    s.sel?.let { eid -> d?.entries?.firstOrNull { it.id == eid }?.let { e -> EntrySheet24(vm, d, e) } }
    if (s.newHome) NewHomeSheet24(vm)
    if (s.newEntry && d != null) NewEntrySheet24(vm, d)
}

/* ---------------- Oversikt ---------------- */

@Composable
private fun HomeCard24(d: HomeDetail24, c: Color, spent: Double, prev: Double, ym: YearMonth) {
    val h = d.home
    val bud = h.budget
    val over = bud != null && spent > bud
    val dl = if (prev > 0) (spent - prev) / prev * 100 else 0.0
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp))
            .background(Brush.linearGradient(listOf(c, lerp(c, Color.Black, .3f)), start = Offset.Zero, end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)))
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(46.dp).clip(CircleShape).background(Color.White.copy(alpha = .18f)), contentAlignment = Alignment.Center) {
                Text(h.name.take(1), color = Color.White, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 22.sp)
            }
            Column(Modifier.weight(1f)) {
                Text(h.name, color = Color.White, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 24.sp, lineHeight = 26.4.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                h.address?.let { Text(it, color = Color.White.copy(alpha = .85f), fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            }
            Box(Modifier.clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = .16f)).padding(10.dp, 5.dp)) {
                Text(monthName24(ym), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1)
            }
        }
        Column {
            Text("Brukt denne måneden", color = Color.White.copy(alpha = .85f), fontSize = 13.sp)
            Row(Modifier.padding(top = 2.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                FitText(kr24(spent), Color.White, 44.sp, FontWeight.Medium, modifier = Modifier.weight(1f, fill = false), family = PaperFonts.serif, min = 26.sp)
                Box(Modifier.padding(bottom = 6.dp).clip(RoundedCornerShape(10.dp)).background(Color.White.copy(alpha = .16f)).padding(9.dp, 3.dp)) {
                    Text((if (dl >= 0) "▲ " else "▼ ") + "${Math.abs(Math.round(dl))} % fra ${monthName24(ym.minusMonths(1)).lowercase(NB24)}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            val pct = if (bud != null && bud > 0) (spent / bud).toFloat().coerceIn(0f, 1f) else 0f
            Box(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)).background(Color.White.copy(alpha = .2f))) {
                if (pct > 0f) Box(Modifier.fillMaxWidth(pct).fillMaxHeight().clip(RoundedCornerShape(5.dp)).background(if (over) Color(0xFFFFB4A8) else Color.White))
            }
            Row {
                Text(if (bud != null) "av ${kr24(bud)} i budsjett" else "Ingen budsjett · hold inne på boligen", color = Color.White.copy(alpha = .9f), fontSize = 12.5.sp, modifier = Modifier.weight(1f), maxLines = 1)
                if (bud != null) Text(if (over) "${kr24(spent - bud)} over" else "${kr24(bud - spent)} igjen", color = Color.White.copy(alpha = .9f), fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
            }
        }
    }
}

@Composable
private fun Actions24(vm: AppViewModel, id: Int, takePhoto: () -> Unit, pickFiles: () -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf<Triple<String, String, () -> Unit>>(
            Triple("Skann", "<path d=\"M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8\"/>") { vm.scanTarget = "receipt"; takePhoto() },
            Triple("Last opp", "<path d=\"M12 16V4M7 9l5-5 5 5M4 20h16\"/>") { vm.scanTarget = "receipt"; pickFiles() },
            Triple("Ny utgift", "") { vm.b24.newEntry = true },
        ).forEachIndexed { i, (n, d, go) ->
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(p.card).clickable(role = Role.Button, onClick = go).padding(vertical = 12.dp, horizontal = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(Modifier.size(38.dp).clip(CircleShape).background(if (i == 0) p.lab else p.bg), contentAlignment = Alignment.Center) {
                    val v = if (d.isNotEmpty()) svg24(d) else null
                    if (v != null) Icon(v, null, tint = if (i == 0) p.onLab else p.ink, modifier = Modifier.size(19.dp))
                    else Text("+", color = p.ink, fontSize = 20.sp)
                }
                Text(n, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1, softWrap = false)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Review24(vm: AppViewModel, d: HomeDetail24, rv: List<HomeEntry24>) {
    val p = PaperPal.current
    val id = d.home.id
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.Bottom) {
            PLabel("Til gjennomgang · ${rv.size}", size = 11.sp, modifier = Modifier.weight(1f))
            Text("Godkjenn alle", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, modifier = Modifier.clickable(role = Role.Button) { vm.b24ApproveAll(id) })
        }
        rv.forEach { e ->
            val ai = e.status == "ai"
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).border(1.5.dp, if (ai) p.line else p.lab, RoundedCornerShape(20.dp)).padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Prompt 30: hele toppraden (miniatyr · butikk · forslag · beløp · ›) åpner detaljarket, også mens AI leser.
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button, onClickLabel = "Åpne ${e.description}") { Haptics.select(); vm.b24.sel = e.id },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    ReceiptThumb24(vm, id, e, Modifier.size(42.dp, 52.dp))
                    Column(Modifier.weight(1f)) {
                        Text(e.description, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(if (ai) "Gemini leser kvitteringen …" else "AI foreslår ${e.category}" + (e.paidBy?.let { " · $it" } ?: ""), color = if (ai) p.lab else p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Text(if (ai) "…" else kr24(e.amount), color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1)
                    Text("›", color = p.mut, fontSize = 17.sp)
                }
                if (!ai) {
                    val opts = (listOf(e.category) + (d.cats.ifEmpty { CATS24.map { it.first } }).filter { it != e.category && it != "Annet" }).take(4)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        opts.forEach { n -> CatChip24(n, n == e.category, catColor24(n, if (n == e.category) e.color else null), 32.dp) { if (n != e.category) vm.b24PatchEntry(id, e.id, category = n) } }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PillBtn24("Detaljer", Modifier.weight(1f), 40.dp, filled = false) { vm.b24.sel = e.id }
                        PillBtn24("Godkjenn", Modifier.weight(1f), 40.dp) { vm.b24PatchEntry(id, e.id, status = "ok", msg = "Godkjent · ${e.category}") }
                    }
                }
            }
        }
    }
}

@Composable
private fun Categories24(vm: AppViewModel, d: HomeDetail24, ym: YearMonth) {
    val p = PaperPal.current
    val es = d.entries.filter { it.status != "ai" && it.date.startsWith(ym.toString()) }
    val spent = es.sumOf { kotlin.math.abs(it.amount) }
    val by = es.groupBy { it.category }.map { (n, l) -> Triple(n, l, l.sumOf { kotlin.math.abs(it.amount) }) }.filter { it.third > 0 }.sortedByDescending { it.third }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            PSerif("Kategorier", 20.sp, modifier = Modifier.weight(1f), maxLines = 1)
            Text(monthName24(ym), color = p.mut, fontSize = 12.5.sp)
        }
        if (by.isEmpty()) Text("Ingen utgifter ennå denne måneden.", color = p.mut, fontSize = 13.sp)
        else {
            Row(Modifier.fillMaxWidth().height(12.dp).clip(RoundedCornerShape(6.dp)), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                by.forEach { (n, l, v) -> Box(Modifier.weight(v.toFloat().coerceAtLeast(1f)).widthIn(min = 4.dp).fillMaxHeight().background(catColor24(n, l.firstOrNull()?.color))) }
            }
            by.forEach { (n, l, v) ->
                val c = catColor24(n, l.firstOrNull()?.color)
                Row(
                    Modifier.fillMaxWidth().clickable { vm.b24.fc = n; vm.b24.tab = "ex" }.padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Box(Modifier.size(30.dp).clip(RoundedCornerShape(10.dp)).background(c.copy(alpha = .16f)), contentAlignment = Alignment.Center) {
                        Text(catIcon24(n), color = c, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                    }
                    Row(Modifier.weight(1f)) {
                        Text(n, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                        Text(" · ${l.size} ${if (l.size == 1) "utgift" else "utgifter"}", color = p.mut, fontWeight = FontWeight.Medium, fontSize = 14.sp, maxLines = 1, softWrap = false)
                    }
                    if (spent > 0) Text("${Math.round(v / spent * 100)} %", color = p.mut, fontSize = 12.sp, maxLines = 1)
                    Text(kr24(v), color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, textAlign = TextAlign.End, maxLines = 1, modifier = Modifier.width(86.dp))
                }
            }
        }
    }
}

@Composable
private fun History24(d: HomeDetail24, c: Color, ym: YearMonth) {
    val p = PaperPal.current
    val months = (5 downTo 0).map { ym.minusMonths(it.toLong()) }
    val vals = months.map { m -> d.entries.filter { it.status != "ai" && it.date.startsWith(m.toString()) }.sumOf { kotlin.math.abs(it.amount) } }
    val mx = (vals.maxOrNull() ?: 0.0).coerceAtLeast(1.0)
    val avg = vals.dropLast(1).average().takeIf { !it.isNaN() } ?: 0.0
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            PSerif("Historikk", 20.sp, modifier = Modifier.weight(1f), maxLines = 1)
            Text("Snitt ${kr24(avg)}", color = p.mut, fontSize = 12.5.sp)
        }
        Row(Modifier.fillMaxWidth().height(130.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
            months.forEachIndexed { i, m ->
                val last = i == months.lastIndex
                Column(Modifier.weight(1f).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.Bottom)) {
                    Text("${String.format(NB24, "%.1f", vals[i] / 1000).replace(",0", "")}k", color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, maxLines = 1)
                    Box(Modifier.fillMaxWidth().fillMaxHeight(.66f * (vals[i] / mx).toFloat().coerceIn(0.04f, 1f)).clip(RoundedCornerShape(8.dp))
                        .background(if (last) c else lerp(p.bg, c, .3f)))
                    Text(monthName24(m, false).take(3), color = if (last) p.ink else p.mut, fontWeight = if (last) FontWeight.ExtraBold else FontWeight.Medium, fontSize = 11.5.sp, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun ExpenseRow24(vm: AppViewModel, e: HomeEntry24, top: Boolean, full: Boolean) {
    val p = PaperPal.current
    val c = catColor24(e.category, e.color)
    val ai = e.status == "ai"
    val rv = e.status == "review"
    Column {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().clickable { vm.b24.sel = e.id }.padding(vertical = if (full) 12.dp else 11.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(c.copy(alpha = .16f)), contentAlignment = Alignment.Center) {
                Text(catIcon24(e.category), color = c, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
            }
            Column(Modifier.weight(1f)) {
                Text(e.description, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(ddmm24(e.date) + " · " + e.category + (if (full) e.paidBy?.let { " · $it" } ?: "" else ""), color = if (full && (ai || rv)) p.lab else p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(if (ai) "…" else kr24(e.amount), color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
                if (full) {
                    val rc = when { ai -> "Leses av AI"; rv -> "Til gjennomgang"; e.receiptId != null -> "⎙ Kvittering"; else -> "" }
                    if (rc.isNotEmpty()) Text(rc, color = p.mut, fontSize = 11.sp, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun Recent24(vm: AppViewModel, d: HomeDetail24) {
    val p = PaperPal.current
    val l = d.entries.filter { it.status == "ok" }.take(5)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp, 6.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 4.dp), verticalAlignment = Alignment.Bottom) {
            PSerif("Siste utgifter", 20.sp, modifier = Modifier.weight(1f), maxLines = 1)
            Text("Alle ›", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, modifier = Modifier.clickable { vm.b24.fc = "Alle"; vm.b24.tab = "ex" })
        }
        if (l.isEmpty()) Text("Ingen utgifter ennå. Skann en kvittering, så havner den her.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(vertical = 12.dp))
        l.forEachIndexed { i, e -> ExpenseRow24(vm, e, i > 0, false) }
    }
}

@Composable
private fun Shared24(vm: AppViewModel, d: HomeDetail24) {
    val p = PaperPal.current
    // Prompt 47: raden står i Rediger bolig (ikke på Oversikt); trykk lukker arket og åpner Tilgang.
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp))
            .clickable(role = Role.Button) { vm.b24.edit = null; vm.b24.tab = "acc" }.padding(16.dp, 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val n = minOf(4, d.members.size)
        Box(Modifier.width(if (n == 0) 0.dp else (34 + 26 * (n - 1)).dp).height(34.dp)) {
            d.members.take(4).forEachIndexed { i, m ->
                Box(
                    Modifier.offset(x = (26 * i).dp).size(34.dp).clip(CircleShape).background(p.card).padding(2.dp).clip(CircleShape).background(Color(MEMC24[i % MEMC24.size])),
                    contentAlignment = Alignment.Center,
                ) { Text(m.name.take(2).uppercase(NB24), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp, maxLines = 1) }
            }
        }
        Column(Modifier.weight(1f).padding(start = 10.dp)) {
            Text("Delt med ${d.members.size} ${if (d.members.size == 1) "person" else "personer"}", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1)
            Text("Tilgang · hvem som kan se og laste opp", color = p.mut, fontSize = 12.sp, maxLines = 1)
        }
        Text("›", color = p.mut, fontSize = 17.sp)
    }
}

/* ---------------- Utgifter ---------------- */

@Composable
private fun Expenses24(vm: AppViewModel, d: HomeDetail24) {
    val p = PaperPal.current
    val s = vm.b24
    val q = s.q.trim().lowercase()
    val cats = listOf("Alle") + (d.cats.ifEmpty { CATS24.map { it.first } } + d.entries.map { it.category }).distinct()
    val ex = d.entries.filter { (s.fc == "Alle" || it.category == s.fc) && (q.isEmpty() || "${it.description} ${it.category} ${it.aiShort ?: ""} ${it.paidBy ?: ""}".lowercase().contains(q)) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth().height(46.dp).clip(CircleShape).background(p.card).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            // Prompt 27: ✕ til venstre når det står tekst.
            SearchLead27(s.q.isNotEmpty(), p.ink, p.mut, bg = p.line, idle = { svg24("<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M20 20l-3.5-3.5\"/>")?.let { Icon(it, null, tint = p.mut, modifier = Modifier.size(17.dp)) } }) { s.q = "" }
            BasicTextField(
                s.q, { s.q = it }, singleLine = true, modifier = Modifier.weight(1f),
                textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.Medium), cursorBrush = SolidColor(p.ink),
                decorationBox = { inner -> Box { if (s.q.isEmpty()) Text("Søk i utgifter og kvitteringer", color = p.mut, fontSize = 15.sp, maxLines = 1); inner() } },
            )
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            cats.forEach { n ->
                val on = s.fc == n
                Box(
                    Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(if (on) p.ink else p.card).border(1.dp, if (on) p.ink else p.line, RoundedCornerShape(17.dp))
                        .clickable { s.fc = n }.padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(n, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1, softWrap = false) }
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp)) {
            Text("${ex.size} utgifter", color = p.mut, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Text(kr24(ex.filter { it.status != "ai" }.sumOf { kotlin.math.abs(it.amount) }), color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp, 4.dp)) {
            if (ex.isEmpty()) Text("Ingen utgifter passer søket.", color = p.mut, fontSize = 13.5.sp, modifier = Modifier.padding(vertical = 16.dp))
            ex.take(150).forEachIndexed { i, e -> ExpenseRow24(vm, e, i > 0, true) }
        }
    }
}

/* ---------------- Tilgang ---------------- */

@Composable
private fun Access24(vm: AppViewModel, d: HomeDetail24, homeCount: Int) {
    val p = PaperPal.current
    val id = d.home.id
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp, 4.dp)) {
            PSerif("Hvem har tilgang", 20.sp, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp), maxLines = 1)
            d.members.forEachIndexed { i, m ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(40.dp).clip(CircleShape).background(Color(MEMC24[i % MEMC24.size])), contentAlignment = Alignment.Center) {
                        Text(m.name.take(2).uppercase(NB24), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(m.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(roleDesc24(m.role) + if (m.you) " · deg" else "", color = p.mut, fontSize = 12.sp, maxLines = 2)
                    }
                    Box(
                        Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(16.dp))
                            .clickable(role = Role.Button) {
                                when {
                                    !d.isOwner -> vm.flash("Bare eiere kan endre tilgang")
                                    m.you && m.role == "owner" -> vm.flash("Du er eier av boligen")
                                    else -> vm.b24SetRole(id, m.id, ROLES24[(ROLES24.indexOf(m.role) + 1) % ROLES24.size])
                                }
                            }.padding(horizontal = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text("${roleName24(m.role)} ▾", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1, softWrap = false) }
                    if (!m.you && d.isOwner) Box(
                        Modifier.size(32.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Fjern ${m.name}") { vm.b24RemoveMember(id, m) },
                        contentAlignment = Alignment.Center,
                    ) { Text("−", color = p.lab, fontSize = 18.sp) }
                }
            }
        }
        // Prompt 30: «Del boligen» med brukerne i Homelab (ui/Boliger30.kt) i stedet for «Inviter»; e-post/navn som før når ingen er valgt.
        if (d.isOwner) ShareHome30(vm, d) { who, role -> vm.b24Invite(id, who, role) }
        AboutHome24(vm, d, homeCount)
    }
}

@Composable
private fun AboutHome24(vm: AppViewModel, d: HomeDetail24, homeCount: Int) {
    val p = PaperPal.current
    val h = d.home
    var name by remember(h.id) { mutableStateOf(h.name) }
    var addr by remember(h.id) { mutableStateOf(h.address ?: "") }
    var bud by remember(h.id) { mutableStateOf(h.budget?.let { Math.round(it).toString() } ?: "") }
    var arm by remember(h.id) { mutableStateOf(false) }
    // Lagres et øyeblikk etter at man slutter å skrive (som i designet, der endringer lagres med en gang).
    LaunchedEffect(name, addr, bud) {
        delay(900)
        val body = JSONObject()
        if (name.isNotBlank() && name.trim() != h.name) body.put("name", name.trim())
        if (addr.trim() != (h.address ?: "")) body.put("address", addr.trim())
        val bv = bud.filter { it.isDigit() }
        if (bv != (h.budget?.let { Math.round(it).toString() } ?: "")) body.put("budget", bv.ifBlank { null } ?: JSONObject.NULL)
        if (body.length() > 0) vm.b24PatchHome(h.id, body)
    }
    LaunchedEffect(arm) { if (arm) { delay(2500); arm = false } }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        PSerif("Om boligen", 20.sp, maxLines = 1)
        FieldLabel24("Navn"); Input24(name, { name = it.take(60) }, "", bg = p.bg, height = 44.dp)
        FieldLabel24("Adresse"); Input24(addr, { addr = it.take(120) }, "", bg = p.bg, weight = FontWeight.Medium, height = 44.dp)
        FieldLabel24("Månedsbudsjett (kr)"); Input24(bud, { bud = it.filter { c -> c.isDigit() }.take(9) }, "", bg = p.bg, mono = true, number = true, height = 44.dp)
        FieldLabel24("Farge")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            HOME24_COLORS.take(6).forEach { c ->
                val on = h.color.equals(c, true)
                Box(Modifier.size(34.dp).clip(CircleShape).border(3.dp, if (on) p.ink else Color.Transparent, CircleShape).background(Color(color(c)), CircleShape)
                    .clickable { vm.b24PatchHome(h.id, JSONObject().put("color", c)) })
            }
        }
        listOf(
            Triple("autoCat", "AI-kategorisering", "Kvitteringer over 90 % sikkerhet godkjennes automatisk") to h.autoCat,
            Triple("notify", "Varsle ved nye utgifter", "Push når noen laster opp en kvittering") to h.notify,
        ).forEach { (t, on) ->
            Column {
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().clickable { vm.b24PatchHome(h.id, JSONObject().put(t.first, !on)) }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(t.second, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text(t.third, color = p.mut, fontSize = 12.sp)
                    }
                    Toggle24(on)
                }
            }
        }
        val canDel = homeCount > 1 && d.isOwner
        Box(
            Modifier.fillMaxWidth().height(42.dp).clip(RoundedCornerShape(21.dp)).border(1.dp, p.line, RoundedCornerShape(21.dp))
                .clickable(enabled = canDel, role = Role.Button) { if (!arm) { arm = true; vm.flash("Trykk igjen for å slette ${h.name}") } else { arm = false; vm.b24DeleteHome(h.id) } },
            contentAlignment = Alignment.Center,
        ) {
            Text(if (homeCount <= 1) "Kan ikke slette eneste bolig" else if (!d.isOwner) "Bare eiere kan slette boligen" else "Slett ${h.name}",
                color = p.lab.copy(alpha = if (canDel) 1f else .4f), fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
        }
    }
}

/* ---------------- Små komponenter ---------------- */

@Composable
private fun Toggle24(on: Boolean) {
    val p = PaperPal.current
    Box(Modifier.size(44.dp, 26.dp).clip(RoundedCornerShape(13.dp)).background(if (on) p.pos else p.line).padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
        Box(Modifier.size(20.dp).clip(CircleShape).background(Color.White))
    }
}

@Composable
private fun FieldLabel24(t: String) = Text(t, color = PaperPal.current.mut, fontSize = 12.5.sp)

@Composable
private fun PillBtn24(text: String, modifier: Modifier, height: Dp, filled: Boolean = true, color: Color? = null, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        modifier.height(height).clip(RoundedCornerShape(height / 2)).background(if (filled) p.ink else Color.Transparent)
            .then(if (filled) Modifier else Modifier.border(1.dp, p.line, RoundedCornerShape(height / 2))).clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = color ?: if (filled) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = if (height >= 46.dp) 15.sp else 13.5.sp, maxLines = 1) }
}

@Composable
private fun CatChip24(n: String, on: Boolean, c: Color, height: Dp, onClick: () -> Unit) {
    val p = PaperPal.current
    Row(
        Modifier.height(height).clip(RoundedCornerShape(height / 2)).background(if (on) p.ink else p.card).border(1.dp, if (on) p.ink else p.line, RoundedCornerShape(height / 2))
            .clickable(onClick = onClick).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(c))
        Text(n, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1, softWrap = false)
    }
}

@Composable
private fun Input24(
    value: String, onChange: (String) -> Unit, placeholder: String, bg: Color = PaperPal.current.card, mono: Boolean = false,
    weight: FontWeight = FontWeight.SemiBold, number: Boolean = false, height: Dp = 46.dp, size: TextUnit = 15.sp, onDone: (() -> Unit)? = null,
) {
    val p = PaperPal.current
    BasicTextField(
        value, onChange, singleLine = true, modifier = Modifier.fillMaxWidth(),
        textStyle = TextStyle(color = p.ink, fontSize = size, fontWeight = weight, fontFamily = if (mono) PaperFonts.mono else PaperFonts.sans),
        cursorBrush = SolidColor(p.ink),
        keyboardOptions = KeyboardOptions(keyboardType = if (number) KeyboardType.Number else KeyboardType.Text, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }),
        decorationBox = { inner ->
            Box(Modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(14.dp)).background(bg).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp), contentAlignment = Alignment.CenterStart) {
                if (value.isEmpty() && placeholder.isNotEmpty()) Text(placeholder, color = p.mut, fontSize = size, fontWeight = FontWeight.Medium, maxLines = 1)
                inner()
            }
        },
    )
}

@Composable
private fun ReceiptThumb24(vm: AppViewModel, folderId: Int, e: HomeEntry24, modifier: Modifier) {
    val p = PaperPal.current
    Box(modifier.clip(RoundedCornerShape(8.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
        if (e.receiptId != null) ServerImage(vm, "/finans/api/folders/$folderId/receipts/${e.receiptId}/thumb", Modifier.matchParentSize()) {
            Text("⎙", color = p.mut, fontSize = 16.sp, modifier = Modifier.align(Alignment.Center))
        } else Text("⎙", color = p.mut, fontSize = 16.sp)
    }
}

/** Håndtaket øverst i bunnarkene (40 × 5, strekfarge), som i designet. */
@Composable
private fun Handle24() = Box(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 6.dp), contentAlignment = Alignment.Center) {
    Box(Modifier.size(40.dp, 5.dp).clip(RoundedCornerShape(3.dp)).background(PaperPal.current.line))
}

private val SHEET24 = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)

/* ---------------- Bunnark ---------------- */

/** «Rediger bolig»: forhåndsvisning, Navn, Adresse, Budsjett, Farge (7 + fri), Bakgrunn (Farge / Strømstad / eget / Last opp), Lagre og Slett (to trykk). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditHomeSheet24(vm: AppViewModel, h: Home24, index: Int, count: Int) {
    val p = PaperPal.current
    val s = vm.b24
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var name by remember(h.id) { mutableStateOf(h.name) }
    var addr by remember(h.id) { mutableStateOf(h.address ?: "") }
    var bud by remember(h.id) { mutableStateOf(h.budget?.let { Math.round(it).toString() } ?: "") }
    var col by remember(h.id) { mutableStateOf(h.color ?: HOME24_COLORS[index % HOME24_COLORS.size]) }
    var bg by remember(h.id) { mutableStateOf(homeBg24(h, vm.b24LocalBg(h.id))) }
    var own by remember(h.id) { mutableStateOf(bg.takeIf { it.startsWith("upload:") || it.startsWith("local:") }) }
    var hex by remember { mutableStateOf<String?>(null) }
    var arm by remember(h.id) { mutableStateOf(false) }
    var uploading by remember { mutableStateOf(false) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) { uploading = true; vm.b24UploadBg(h.id, uri) { k -> own = k; bg = k; uploading = false } }
    }
    val c = Color(color(col))
    val ownBmp by produceState<Bitmap?>(null, own) { value = own?.let { vm.b24BgBitmap(h, it) } }
    ModalBottomSheet(
        onDismissRequest = { s.edit = null }, sheetState = sheet, containerColor = p.bg, contentColor = p.ink, shape = SHEET24, dragHandle = { Handle24() },
    ) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(16.dp, 0.dp, 16.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.fillMaxWidth().height(44.dp)) {
                PSerif("Rediger bolig", 22.sp, modifier = Modifier.align(Alignment.Center), maxLines = 1)
                Box(
                    Modifier.align(Alignment.CenterEnd).size(38.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).clickable(role = Role.Button, onClickLabel = "Lukk") { s.edit = null },
                    contentAlignment = Alignment.Center,
                ) { Text("×", modifier = Modifier.semantics { contentDescription = "Lukk" }, color = p.ink, fontSize = 17.sp) }
            }
            // Forhåndsvisning med bakgrunn og navn.
            Box(Modifier.fillMaxWidth().height(120.dp).clip(RoundedCornerShape(20.dp)).background(Brush.linearGradient(listOf(c, lerp(c, Color.Black, .3f)), Offset.Zero, Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)))) {
                when {
                    bg == "preset:stromstad" -> Image(painterResource(no.kristo.finanshub.R.drawable.bolig_stromstad), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
                    bg == own -> ownBmp?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
                }
                if (bg != "color") Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = .1f), Color.Black.copy(alpha = .5f)))))
                Text(name.ifBlank { h.name }, color = Color.White, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 26.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.align(Alignment.BottomStart).padding(14.dp))
            }
            FieldLabel24("Navn"); Input24(name, { name = it.take(60) }, "")
            FieldLabel24("Adresse"); Input24(addr, { addr = it.take(120) }, "", weight = FontWeight.Medium)
            FieldLabel24("Budsjett per måned (kr)"); Input24(bud, { bud = it.filter { ch -> ch.isDigit() }.take(9) }, "", mono = true, number = true)
            FieldLabel24("Farge")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                HOME24_COLORS.forEach { k ->
                    Box(
                        Modifier.size(32.dp).clip(CircleShape).border(3.dp, if (col.equals(k, true)) p.ink else Color.Transparent, CircleShape).padding(3.dp)
                            .border(2.dp, p.bg, CircleShape).clip(CircleShape).background(Color(color(k))).clickable { col = k },
                    )
                }
                Box(
                    Modifier.size(32.dp).clip(CircleShape).background(Brush.sweepGradient(listOf(Color(0xFFFF4444), Color(0xFFFFDD00), Color(0xFF44CC44), Color(0xFF00CCFF), Color(0xFF4444FF), Color(0xFFCC44FF), Color(0xFFFF4444))))
                        .clickable(onClickLabel = "Egen farge") { hex = if (hex == null) col else null },
                )
            }
            hex?.let { v ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.weight(1f)) { Input24(v, { t -> hex = ("#" + t.removePrefix("#").filter { it.isLetterOrDigit() }.take(6)); if (Regex("#[0-9a-fA-F]{6}").matches(hex!!)) col = hex!! }, "#rrggbb", mono = true) }
                    PillBtn24("Bruk", Modifier.width(90.dp), 46.dp) { if (Regex("#[0-9a-fA-F]{6}").matches(v)) col = v; hex = null }
                }
            }
            FieldLabel24("Bakgrunn")
            val opts = buildList {
                add("color" to "Farge"); add("preset:stromstad" to "Strømstad")
                own?.let { add(it to "Eget bilde") }
            }
            val all: List<Pair<String, String>?> = opts + listOf(null)
            all.chunked(3).forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { o ->
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            val sel = o != null && bg == o.first
                            Box(
                                Modifier.fillMaxWidth().aspectRatio(1.6f).then(if (sel) Modifier.border(2.dp, p.ink, RoundedCornerShape(14.dp)).padding(4.dp) else Modifier)
                                    .clip(RoundedCornerShape(12.dp))
                                    .then(if (o == null) Modifier.dashed24(p.line, 12.dp) else if (o.first == "color") Modifier.background(c) else Modifier.background(p.card))
                                    .clickable { if (o == null) runCatching { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) } else bg = o.first },
                                contentAlignment = Alignment.Center,
                            ) {
                                when {
                                    o == null -> if (uploading) CircularProgressIndicator(color = p.mut, strokeWidth = 2.dp, modifier = Modifier.size(18.dp)) else Text("+", color = p.mut, fontSize = 20.sp)
                                    o.first == "preset:stromstad" -> Image(painterResource(no.kristo.finanshub.R.drawable.bolig_stromstad), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
                                    o.first == own -> ownBmp?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
                                }
                            }
                            Text(o?.second ?: "Last opp", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1)
                        }
                    }
                    repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
            s.details[h.id]?.let { Shared24(vm, it) } // prompt 47: Tilgang flyttet hit fra fanen
            Column(Modifier.padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                PillBtn24(if (s.busy) "Lagrer …" else "Lagre", Modifier.fillMaxWidth(), 48.dp) {
                    if (!s.busy) vm.b24SaveHome(h.id, name.ifBlank { h.name }, addr, bud, col, bg)
                }
                Box(
                    Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(22.dp)).clickable(enabled = count > 1, role = Role.Button) {
                        if (!arm) arm = true else { arm = false; vm.b24DeleteHome(h.id) }
                    },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(if (count <= 1) "Kan ikke slette siste bolig" else if (arm) "Trykk igjen for å slette ${h.name}" else "Slett bolig", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
            }
        }
    }
}

/** Detaljer for en utgift: kvittering, beløp, AI-forklaring, kategori, Slett og Godkjenn/Lagre. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun EntrySheet24(vm: AppViewModel, d: HomeDetail24, e: HomeEntry24) {
    val p = PaperPal.current
    val s = vm.b24
    val id = d.home.id
    var cat by remember(e.id) { mutableStateOf(e.category) }
    ModalBottomSheet(onDismissRequest = { s.sel = null }, containerColor = p.bg, contentColor = p.ink, shape = SHEET24, dragHandle = { Handle24() }) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(18.dp, 0.dp, 18.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    PLabel(d.home.name + " · " + when (e.status) { "ok" -> "Godkjent"; "ai" -> "Leses av AI"; else -> "Til gjennomgang" }, size = 11.sp)
                    // Prompt 30: butikk/beskrivelse kan redigeres (lagres fortløpende).
                    if (d.canEdit && e.status != "ai") EntryTitle30(vm, id, e, Modifier.padding(top = 4.dp))
                    else PSerif(e.description, 26.sp, modifier = Modifier.padding(top = 4.dp), maxLines = 3)
                }
                SheetButton30("Ferdig") { s.sel = null }
            }
            Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.width(96.dp).heightIn(min = 124.dp).fillMaxHeight().clip(RoundedCornerShape(12.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                    if (e.receiptId != null) ServerImage(vm, "/finans/api/folders/$id/receipts/${e.receiptId}/thumb", Modifier.matchParentSize())
                    else Text("Ingen kvittering", color = p.mut, fontSize = 12.sp, textAlign = TextAlign.Center)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (d.canEdit && e.status != "ai") {
                        EntryAmountDate30(vm, id, e)
                        e.paidBy?.let { Text("Lagt til av $it", color = p.mut, fontSize = 12.sp) }
                    } else {
                        PSerif(if (e.status == "ai") "…" else kr24(e.amount), 34.sp, maxLines = 1)
                        Text(ddmm24(e.date) + (e.paidBy?.let { " · lagt til av $it" } ?: ""), color = p.mut, fontSize = 13.sp)
                    }
                    e.aiShort?.let { Text("✦ $it", color = p.ink, fontSize = 13.sp, lineHeight = 18.9.sp, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.card).padding(12.dp, 10.dp)) }
                }
            }
            FieldLabel24("Kategori")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                (d.cats.ifEmpty { CATS24.map { it.first } } + listOf(e.category)).distinct().forEach { n -> CatChip24(n, n == cat, catColor24(n, if (n == e.category) e.color else null), 34.dp) { cat = n } }
            }
            Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PillBtn24("Slett", Modifier.weight(1f), 46.dp, filled = false, color = p.lab) { vm.b24DeleteEntry(id, e.id) }
                PillBtn24(if (e.status == "ok") "Lagre" else "Godkjenn", Modifier.weight(1f), 46.dp) {
                    vm.b24PatchEntry(id, e.id, status = "ok", category = cat.takeIf { it != e.category }, msg = "Lagret i ${d.home.name}")
                    s.sel = null
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NewHomeSheet24(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.b24
    var n by remember { mutableStateOf("") }
    var a by remember { mutableStateOf("") }
    var b by remember { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = { s.newHome = false }, containerColor = p.bg, contentColor = p.ink, shape = SHEET24, dragHandle = { Handle24() }) {
        Column(Modifier.fillMaxWidth().imePadding().padding(18.dp, 0.dp, 18.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif("Ny bolig", 26.sp, maxLines = 1)
            Input24(n, { n = it.take(60) }, "Navn, f.eks. Hytta")
            Input24(a, { a = it.take(120) }, "Adresse eller sted", weight = FontWeight.Medium)
            Input24(b, { b = it.filter { c -> c.isDigit() }.take(9) }, "Månedsbudsjett (kr)", mono = true, number = true)
            Text("Du blir eier. Du kan invitere andre etterpå.", color = p.mut, fontSize = 12.sp, lineHeight = 17.4.sp)
            PillBtn24(if (s.busy) "Oppretter …" else "Opprett bolig", Modifier.fillMaxWidth(), 48.dp) { if (n.isNotBlank() && !s.busy) vm.b24CreateHome(n, a, b) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun NewEntrySheet24(vm: AppViewModel, d: HomeDetail24) {
    val p = PaperPal.current
    val s = vm.b24
    var m by remember { mutableStateOf("") }
    var a by remember { mutableStateOf("") }
    var c by remember { mutableStateOf("Annet") }
    var picked by remember { mutableStateOf(false) }
    val cats = (d.cats.ifEmpty { CATS24.map { it.first } } + "Annet").distinct()
    ModalBottomSheet(onDismissRequest = { s.newEntry = false }, containerColor = p.bg, contentColor = p.ink, shape = SHEET24, dragHandle = { Handle24() }) {
        Column(Modifier.fillMaxWidth().imePadding().padding(18.dp, 0.dp, 18.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif("Ny utgift · ${d.home.name}", 26.sp, maxLines = 1)
            Input24(m, { m = it.take(120); if (!picked) c = guess24(it).takeIf { g -> g in cats } ?: "Annet" }, "Hva, f.eks. Byggmakker")
            Input24(a, { a = it.filter { ch -> ch.isDigit() || ch == ',' || ch == '.' }.take(12) }, "Beløp (kr)", mono = true, number = true)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                cats.forEach { n -> CatChip24(n, n == c, catColor24(n, null), 34.dp) { c = n; picked = true } }
            }
            PillBtn24(if (s.busy) "Legger til …" else "Legg til", Modifier.fillMaxWidth(), 48.dp) {
                val v = a.replace(',', '.').toDoubleOrNull() ?: 0.0
                if (m.isNotBlank() && v > 0 && !s.busy) vm.b24AddEntry(d.home.id, m, v, c)
            }
        }
    }
}

/** Prompt 47: «‹ Oversikt» øverst på Tilgang-siden. */
@Composable
private fun BackToOverview47(vm: AppViewModel) {
    val p = PaperPal.current
    Box(
        Modifier.height(40.dp).clip(RoundedCornerShape(20.dp)).background(p.card).clickable(role = Role.Button) { Haptics.select(); vm.b24.tab = "ov" }.padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) { Text("‹ Oversikt", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1, softWrap = false) }
}

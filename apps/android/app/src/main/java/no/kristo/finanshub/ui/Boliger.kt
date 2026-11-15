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
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.HomeDetail24
import no.kristo.finanshub.HomeEntry24
import no.kristo.finanshub.loadShareable30
import no.kristo.finanshub.patchEntry30
import no.kristo.finanshub.share30Names
import no.kristo.finanshub.shareHome30
import no.kristo.finanshub.ui.designsystem.HomelabTheme
import no.kristo.finanshub.ui.designsystem.HomelabType
import no.kristo.finanshub.ui.designsystem.DsPalette
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.minimumInteractiveComponentSize

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

/** Kategorifarger (kategoritokenene) og -tegn som i designet (CATS); ukjente kategorier får serverens farge og «•». */
private val CATS24 = DsPalette.Category.let { k ->
    listOf(
        Triple("Strøm", k.amber, "⚡"), Triple("Vaktmester", k.blue, "⌂"), Triple("Hage", k.green, "✿"), Triple("Vedlikehold", k.brown, "⚒"),
        Triple("Forsikring", k.purple, "◈"), Triple("Kommunale avgifter", k.teal, "▤"), Triple("Annet", k.neutral, "•"),
    )
}
private fun catColor24(name: String, hex: String?): Color = CATS24.firstOrNull { it.first.equals(name, true) }?.second ?: hex?.let { Color(color(it)) } ?: DsPalette.Category.neutral
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
/** Avatarfargene for medlemmene (kategoritokenene). */
private val MEMC24: List<Color> = DsPalette.Category.let { listOf(it.red, it.blue, it.amber, it.green, it.purple, it.neutral) }

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
    // Pillen ligger over toppbildet (mørk flate), så statusfargene er de mørke variantene.
    val g = DsPalette.PapirMork
    val dot = when (d.status) { "error" -> g.danger; "warn" -> g.warning; else -> g.success }
    Row(
        Modifier.padding(start = 8.dp, bottom = 4.dp).clip(CircleShape).background(DsPalette.PapirLys.textPrimary.copy(alpha = .55f)).clickable(onClickLabel = "Åpne Domener") { vm.b24OpenDomains() }
            .padding(start = 10.dp, end = 12.dp, top = 7.dp, bottom = 7.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Icon(Icons.Filled.Public, null, tint = Color.White, modifier = Modifier.size(15.dp))
        Column {
            Text(n0(d.visitsToday.toDouble()), color = Color.White, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, style = HomelabType.callout, lineHeight = 15.sp, maxLines = 1)
            Text("besøk i dag · ${d.domains} domener", color = Color.White.copy(alpha = .85f), style = HomelabType.caption, fontWeight = FontWeight.Normal, lineHeight = 12.sp, maxLines = 1)
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
    val p = HomelabTheme.colors
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
                        Modifier.height(52.dp).clip(RoundedCornerShape(26.dp)).background(if (on) p.textPrimary else p.surfaceRaised).border(1.dp, if (on) p.textPrimary else p.line, RoundedCornerShape(26.dp))
                            .combinedClickable(
                                onClickLabel = "Velg ${h.name}", onLongClickLabel = "Rediger ${h.name}",
                                onLongClick = { Haptics.tap(); if (h.id != cur?.id) vm.b24OpenHome(h.id); s.edit = h.id },
                                onClick = { Haptics.select(); if (h.id != cur?.id) vm.b24OpenHome(h.id) },
                            ).padding(start = 8.dp, end = 16.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Box(Modifier.size(36.dp).clip(CircleShape).background(homeColor24(h, i)), contentAlignment = Alignment.Center) {
                            Text(h.name.take(1), color = Color.White, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, style = HomelabType.body, maxLines = 1)
                        }
                        Column {
                            Text(h.name, color = if (on) p.surface else p.textPrimary, fontWeight = FontWeight.Bold, style = HomelabType.callout, maxLines = 1, softWrap = false)
                            Text("${kr24(spentOf(h.id))} i ${monthName24(ym, false).lowercase(NB24)}", color = (if (on) p.surface else p.textPrimary).copy(alpha = .75f), style = HomelabType.caption, fontWeight = FontWeight.Normal, maxLines = 1, softWrap = false)
                        }
                    }
                }
                Box(
                    Modifier.height(52.dp).clip(RoundedCornerShape(26.dp)).dashed24(p.line, 26.dp).clickable(role = Role.Button) { s.newHome = true }.padding(horizontal = 18.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("+ Ny bolig", color = p.textPrimary, fontWeight = FontWeight.Bold, style = HomelabType.subheadline, maxLines = 1, softWrap = false) }
            }
        }
        if (homes == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.textPrimary) } }
        else if (homes.isEmpty()) item {
            Text("Ingen boliger ennå. Trykk «+ Ny bolig» for å lage den første.", color = p.textTertiary, style = HomelabType.subheadline, modifier = Modifier.padding(horizontal = 20.dp))
        }
        if (cur != null) {
            val rv = d?.entries?.filter { it.status == "review" || it.status == "ai" } ?: emptyList()
            // Fanevelger
            item {
                Row(Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(CircleShape).background(p.surfaceRaised).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    listOf("ov" to "Oversikt", "ex" to (if (rv.isNotEmpty()) "Utgifter · ${d?.entries?.size ?: 0}" else "Utgifter")).forEach { (k, n) ->
                        val on = s.tab == k
                        Box(
                            Modifier.weight(1f).minimumInteractiveComponentSize().height(38.dp).clip(CircleShape).background(if (on) p.textPrimary else Color.Transparent).clickable(role = Role.Tab) { Haptics.select(); s.tab = k },
                            contentAlignment = Alignment.Center,
                        ) { Text(n, color = if (on) p.surface else p.textPrimary, fontWeight = FontWeight.Bold, style = HomelabType.subheadline, maxLines = 1, softWrap = false) }
                    }
                }
            }
            if (d == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.textPrimary) } }
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
                Text(h.name.take(1), color = Color.White, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, style = HomelabType.title3)
            }
            Column(Modifier.weight(1f)) {
                Text(h.name, color = Color.White, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, style = HomelabType.title3, lineHeight = 26.4.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                h.address?.let { Text(it, color = Color.White.copy(alpha = .85f), style = HomelabType.footnote, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            }
            Box(Modifier.clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = .16f)).padding(10.dp, 5.dp)) {
                Text(monthName24(ym), color = Color.White, fontWeight = FontWeight.Bold, style = HomelabType.footnote, maxLines = 1)
            }
        }
        Column {
            Text("Brukt denne måneden", color = Color.White.copy(alpha = .85f), style = HomelabType.subheadline)
            Row(Modifier.padding(top = 2.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                FitText(kr24(spent), Color.White, 44.sp, FontWeight.Medium, modifier = Modifier.weight(1f, fill = false), family = PaperFonts.serif, min = 26.sp)
                Box(Modifier.padding(bottom = 6.dp).clip(RoundedCornerShape(10.dp)).background(Color.White.copy(alpha = .16f)).padding(9.dp, 3.dp)) {
                    Text((if (dl >= 0) "▲ " else "▼ ") + "${Math.abs(Math.round(dl))} % fra ${monthName24(ym.minusMonths(1)).lowercase(NB24)}", color = Color.White, fontWeight = FontWeight.Bold, style = HomelabType.subheadline, maxLines = 1)
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            val pct = if (bud != null && bud > 0) (spent / bud).toFloat().coerceIn(0f, 1f) else 0f
            Box(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)).background(Color.White.copy(alpha = .2f))) {
                if (pct > 0f) Box(Modifier.fillMaxWidth(pct).fillMaxHeight().clip(RoundedCornerShape(5.dp)).background(if (over) DsPalette.PapirMork.danger else Color.White))
            }
            Row {
                Text(if (bud != null) "av ${kr24(bud)} i budsjett" else "Ingen budsjett · hold inne på boligen", color = Color.White.copy(alpha = .9f), style = HomelabType.footnote, modifier = Modifier.weight(1f), maxLines = 1)
                if (bud != null) Text(if (over) "${kr24(spent - bud)} over" else "${kr24(bud - spent)} igjen", color = Color.White.copy(alpha = .9f), fontWeight = FontWeight.Bold, style = HomelabType.footnote, maxLines = 1)
            }
        }
    }
}

@Composable
private fun Actions24(vm: AppViewModel, id: Int, takePhoto: () -> Unit, pickFiles: () -> Unit) {
    val p = HomelabTheme.colors
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf<Triple<String, String, () -> Unit>>(
            Triple("Skann", "<path d=\"M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8\"/>") { vm.scanTarget = "receipt"; takePhoto() },
            Triple("Last opp", "<path d=\"M12 16V4M7 9l5-5 5 5M4 20h16\"/>") { vm.scanTarget = "receipt"; pickFiles() },
            Triple("Ny utgift", "") { vm.b24.newEntry = true },
        ).forEachIndexed { i, (n, d, go) ->
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(p.surfaceRaised).clickable(role = Role.Button, onClick = go).padding(vertical = 12.dp, horizontal = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(Modifier.size(38.dp).clip(CircleShape).background(if (i == 0) p.accent else p.surface), contentAlignment = Alignment.Center) {
                    val v = if (d.isNotEmpty()) svg24(d) else null
                    if (v != null) Icon(v, null, tint = if (i == 0) p.onAccent else p.textPrimary, modifier = Modifier.size(19.dp))
                    else Icon(Icons.Filled.Add, contentDescription = null, tint = p.textPrimary, modifier = Modifier.size(20.dp))
                }
                Text(n, color = p.textPrimary, fontWeight = FontWeight.Bold, style = HomelabType.footnote, maxLines = 1, softWrap = false)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Review24(vm: AppViewModel, d: HomeDetail24, rv: List<HomeEntry24>) {
    val p = HomelabTheme.colors
    val id = d.home.id
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.Bottom) {
            PLabel("Til gjennomgang · ${rv.size}", size = HomelabType.caption.fontSize, modifier = Modifier.weight(1f))
            Text("Godkjenn alle", color = p.textPrimary, fontWeight = FontWeight.Bold, style = HomelabType.footnote, modifier = Modifier.clickable(role = Role.Button) { vm.b24ApproveAll(id) })
        }
        rv.forEach { e ->
            val ai = e.status == "ai"
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.surfaceRaised).border(1.5.dp, if (ai) p.line else p.accent, RoundedCornerShape(20.dp)).padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Prompt 30: hele toppraden (miniatyr · butikk · forslag · beløp · ›) åpner detaljarket, også mens AI leser.
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button, onClickLabel = "Åpne ${e.description}") { Haptics.select(); vm.b24.sel = e.id },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    ReceiptThumb24(vm, id, e, Modifier.size(42.dp, 52.dp))
                    Column(Modifier.weight(1f)) {
                        Text(e.description, color = p.textPrimary, fontWeight = FontWeight.Bold, style = HomelabType.callout, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(if (ai) "Glimt leser lokalt …" else "AI foreslår ${e.category}" + (e.paidBy?.let { " · $it" } ?: ""), color = if (ai) p.accent else p.textTertiary, style = HomelabType.footnote, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Text(if (ai) "…" else kr24(e.amount), color = p.textPrimary, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, style = HomelabType.callout, maxLines = 1)
                    Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = p.textTertiary, modifier = Modifier.size(20.dp))
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
    val p = HomelabTheme.colors
    val es = d.entries.filter { it.status != "ai" && it.date.startsWith(ym.toString()) }
    val spent = es.sumOf { kotlin.math.abs(it.amount) }
    val by = es.groupBy { it.category }.map { (n, l) -> Triple(n, l, l.sumOf { kotlin.math.abs(it.amount) }) }.filter { it.third > 0 }.sortedByDescending { it.third }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.surfaceRaised).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            PSerif("Kategorier", HomelabType.headline.fontSize, modifier = Modifier.weight(1f), maxLines = 1)
            Text(monthName24(ym), color = p.textTertiary, style = HomelabType.footnote)
        }
        if (by.isEmpty()) Text("Ingen utgifter ennå denne måneden.", color = p.textTertiary, style = HomelabType.subheadline)
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
                        Text(catIcon24(n), color = c, fontWeight = FontWeight.ExtraBold, style = HomelabType.callout)
                    }
                    Row(Modifier.weight(1f)) {
                        Text(n, color = p.textPrimary, fontWeight = FontWeight.SemiBold, style = HomelabType.callout, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                        Text(" · ${l.size} ${if (l.size == 1) "utgift" else "utgifter"}", color = p.textTertiary, fontWeight = FontWeight.Medium, style = HomelabType.callout, maxLines = 1, softWrap = false)
                    }
                    if (spent > 0) Text("${Math.round(v / spent * 100)} %", color = p.textTertiary, style = HomelabType.footnote, maxLines = 1)
                    Text(kr24(v), color = p.textPrimary, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, style = HomelabType.callout, textAlign = TextAlign.End, maxLines = 1, modifier = Modifier.width(86.dp))
                }
            }
        }
    }
}

@Composable
private fun History24(d: HomeDetail24, c: Color, ym: YearMonth) {
    val p = HomelabTheme.colors
    val months = (5 downTo 0).map { ym.minusMonths(it.toLong()) }
    val vals = months.map { m -> d.entries.filter { it.status != "ai" && it.date.startsWith(m.toString()) }.sumOf { kotlin.math.abs(it.amount) } }
    val mx = (vals.maxOrNull() ?: 0.0).coerceAtLeast(1.0)
    val avg = vals.dropLast(1).average().takeIf { !it.isNaN() } ?: 0.0
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.surfaceRaised).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            PSerif("Historikk", HomelabType.headline.fontSize, modifier = Modifier.weight(1f), maxLines = 1)
            Text("Snitt ${kr24(avg)}", color = p.textTertiary, style = HomelabType.footnote)
        }
        Row(Modifier.fillMaxWidth().height(130.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
            months.forEachIndexed { i, m ->
                val last = i == months.lastIndex
                Column(Modifier.weight(1f).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.Bottom)) {
                    Text("${String.format(NB24, "%.1f", vals[i] / 1000).replace(",0", "")}k", color = p.textTertiary, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, style = HomelabType.caption, maxLines = 1)
                    Box(Modifier.fillMaxWidth().fillMaxHeight(.66f * (vals[i] / mx).toFloat().coerceIn(0.04f, 1f)).clip(RoundedCornerShape(8.dp))
                        .background(if (last) c else lerp(p.surface, c, .3f)))
                    Text(monthName24(m, false).take(3), color = if (last) p.textPrimary else p.textTertiary, fontWeight = if (last) FontWeight.ExtraBold else FontWeight.Medium, style = HomelabType.caption, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun ExpenseRow24(vm: AppViewModel, e: HomeEntry24, top: Boolean, full: Boolean) {
    val p = HomelabTheme.colors
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
                Text(catIcon24(e.category), color = c, fontWeight = FontWeight.ExtraBold, style = HomelabType.callout)
            }
            Column(Modifier.weight(1f)) {
                Text(e.description, color = p.textPrimary, fontWeight = FontWeight.SemiBold, style = HomelabType.callout, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(ddmm24(e.date) + " · " + e.category + (if (full) e.paidBy?.let { " · $it" } ?: "" else ""), color = if (full && (ai || rv)) p.accent else p.textTertiary, style = HomelabType.footnote, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(if (ai) "…" else kr24(e.amount), color = p.textPrimary, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, style = HomelabType.callout, maxLines = 1)
                if (full) {
                    val rc = when { ai -> "Leses av AI"; rv -> "Til gjennomgang"; e.receiptId != null -> "⎙ Kvittering"; else -> "" }
                    if (rc.isNotEmpty()) Text(rc, color = p.textTertiary, style = HomelabType.caption, fontWeight = FontWeight.Normal, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun Recent24(vm: AppViewModel, d: HomeDetail24) {
    val p = HomelabTheme.colors
    val l = d.entries.filter { it.status == "ok" }.take(5)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.surfaceRaised).padding(16.dp, 6.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 4.dp), verticalAlignment = Alignment.Bottom) {
            PSerif("Siste utgifter", HomelabType.headline.fontSize, modifier = Modifier.weight(1f), maxLines = 1)
            Text("Alle ›", color = p.textPrimary, fontWeight = FontWeight.Bold, style = HomelabType.footnote, modifier = Modifier.clickable { vm.b24.fc = "Alle"; vm.b24.tab = "ex" })
        }
        if (l.isEmpty()) Text("Ingen utgifter ennå. Skann en kvittering, så havner den her.", color = p.textTertiary, style = HomelabType.subheadline, modifier = Modifier.padding(vertical = 12.dp))
        l.forEachIndexed { i, e -> ExpenseRow24(vm, e, i > 0, false) }
    }
}

@Composable
private fun Shared24(vm: AppViewModel, d: HomeDetail24) {
    val p = HomelabTheme.colors
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
                    Modifier.offset(x = (26 * i).dp).size(34.dp).clip(CircleShape).background(p.surfaceRaised).padding(2.dp).clip(CircleShape).background(MEMC24[i % MEMC24.size]),
                    contentAlignment = Alignment.Center,
                ) { Text(m.name.take(2).uppercase(NB24), color = Color.White, fontWeight = FontWeight.ExtraBold, style = HomelabType.footnote, maxLines = 1) }
            }
        }
        Column(Modifier.weight(1f).padding(start = 10.dp)) {
            Text("Delt med ${d.members.size} ${if (d.members.size == 1) "person" else "personer"}", color = p.textPrimary, fontWeight = FontWeight.Bold, style = HomelabType.callout, maxLines = 1)
            Text("Tilgang · hvem som kan se og laste opp", color = p.textTertiary, style = HomelabType.footnote, maxLines = 1)
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = p.textTertiary, modifier = Modifier.size(20.dp))
    }
}

/* ---------------- Utgifter ---------------- */

@Composable
private fun Expenses24(vm: AppViewModel, d: HomeDetail24) {
    val p = HomelabTheme.colors
    val s = vm.b24
    val q = s.q.trim().lowercase()
    val cats = listOf("Alle") + (d.cats.ifEmpty { CATS24.map { it.first } } + d.entries.map { it.category }).distinct()
    val ex = d.entries.filter { (s.fc == "Alle" || it.category == s.fc) && (q.isEmpty() || "${it.description} ${it.category} ${it.aiShort ?: ""} ${it.paidBy ?: ""}".lowercase().contains(q)) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth().height(46.dp).clip(CircleShape).background(p.surfaceRaised).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            // Prompt 27: ✕ til venstre når det står tekst.
            SearchLead27(s.q.isNotEmpty(), p.textPrimary, p.textTertiary, bg = p.line, idle = { svg24("<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M20 20l-3.5-3.5\"/>")?.let { Icon(it, null, tint = p.textTertiary, modifier = Modifier.size(17.dp)) } }) { s.q = "" }
            BasicTextField(
                s.q, { s.q = it }, singleLine = true, modifier = Modifier.weight(1f),
                textStyle = HomelabType.callout.copy(color = p.textPrimary, fontWeight = FontWeight.Medium), cursorBrush = SolidColor(p.textPrimary),
                decorationBox = { inner -> Box { if (s.q.isEmpty()) Text("Søk i utgifter og kvitteringer", color = p.textTertiary, style = HomelabType.callout, maxLines = 1); inner() } },
            )
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            cats.forEach { n ->
                val on = s.fc == n
                Box(
                    Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(if (on) p.textPrimary else p.surfaceRaised).border(1.dp, if (on) p.textPrimary else p.line, RoundedCornerShape(17.dp))
                        .clickable { s.fc = n }.padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(n, color = if (on) p.surface else p.textPrimary, fontWeight = FontWeight.SemiBold, style = HomelabType.footnote, maxLines = 1, softWrap = false) }
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp)) {
            Text("${ex.size} utgifter", color = p.textTertiary, style = HomelabType.subheadline, modifier = Modifier.weight(1f))
            Text(kr24(ex.filter { it.status != "ai" }.sumOf { kotlin.math.abs(it.amount) }), color = p.textPrimary, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, style = HomelabType.subheadline)
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.surfaceRaised).padding(16.dp, 4.dp)) {
            if (ex.isEmpty()) Text("Ingen utgifter passer søket.", color = p.textTertiary, style = HomelabType.subheadline, modifier = Modifier.padding(vertical = 16.dp))
            ex.take(150).forEachIndexed { i, e -> ExpenseRow24(vm, e, i > 0, true) }
        }
    }
}

/* ---------------- Tilgang ---------------- */

@Composable
private fun Access24(vm: AppViewModel, d: HomeDetail24, homeCount: Int) {
    val p = HomelabTheme.colors
    val id = d.home.id
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.surfaceRaised).padding(16.dp, 4.dp)) {
            PSerif("Hvem har tilgang", HomelabType.headline.fontSize, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp), maxLines = 1)
            d.members.forEachIndexed { i, m ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(40.dp).clip(CircleShape).background(MEMC24[i % MEMC24.size]), contentAlignment = Alignment.Center) {
                        Text(m.name.take(2).uppercase(NB24), color = Color.White, fontWeight = FontWeight.ExtraBold, style = HomelabType.subheadline)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(m.name, color = p.textPrimary, fontWeight = FontWeight.Bold, style = HomelabType.callout, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(roleDesc24(m.role) + if (m.you) " · deg" else "", color = p.textTertiary, style = HomelabType.footnote, maxLines = 2)
                    }
                    Box(
                        Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).background(p.surface).border(1.dp, p.line, RoundedCornerShape(16.dp))
                            .clickable(role = Role.Button) {
                                when {
                                    !d.isOwner -> vm.flash("Bare eiere kan endre tilgang")
                                    m.you && m.role == "owner" -> vm.flash("Du er eier av boligen")
                                    else -> vm.b24SetRole(id, m.id, ROLES24[(ROLES24.indexOf(m.role) + 1) % ROLES24.size])
                                }
                            }.padding(horizontal = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text("${roleName24(m.role)} ▾", color = p.textPrimary, fontWeight = FontWeight.Bold, style = HomelabType.footnote, maxLines = 1, softWrap = false) }
                    if (!m.you && d.isOwner) Box(
                        Modifier.size(48.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Fjern ${m.name}") { vm.b24RemoveMember(id, m) },
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.Remove, contentDescription = null, tint = p.accent, modifier = Modifier.size(20.dp)) }
                }
            }
        }
        // Prompt 30: «Del boligen» med brukerne i Homelab (ui/Boliger.kt) i stedet for «Inviter»; e-post/navn som før når ingen er valgt.
        if (d.isOwner) ShareHome30(vm, d) { who, role -> vm.b24Invite(id, who, role) }
        AboutHome24(vm, d, homeCount)
    }
}

@Composable
private fun AboutHome24(vm: AppViewModel, d: HomeDetail24, homeCount: Int) {
    val p = HomelabTheme.colors
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
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.surfaceRaised).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        PSerif("Om boligen", HomelabType.headline.fontSize, maxLines = 1)
        FieldLabel24("Navn"); Input24(name, { name = it.take(60) }, "", bg = p.surface, height = 44.dp)
        FieldLabel24("Adresse"); Input24(addr, { addr = it.take(120) }, "", bg = p.surface, weight = FontWeight.Medium, height = 44.dp)
        FieldLabel24("Månedsbudsjett (kr)"); Input24(bud, { bud = it.filter { c -> c.isDigit() }.take(9) }, "", bg = p.surface, mono = true, number = true, height = 44.dp)
        FieldLabel24("Farge")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            HOME24_COLORS.take(6).forEach { c ->
                val on = h.color.equals(c, true)
                Box(Modifier.size(34.dp).clip(CircleShape).border(3.dp, if (on) p.textPrimary else Color.Transparent, CircleShape).background(Color(color(c)), CircleShape)
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
                        Text(t.second, color = p.textPrimary, fontWeight = FontWeight.Bold, style = HomelabType.callout)
                        Text(t.third, color = p.textTertiary, style = HomelabType.footnote)
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
                color = p.accent.copy(alpha = if (canDel) 1f else .4f), fontWeight = FontWeight.Bold, style = HomelabType.subheadline)
        }
    }
}

/* ---------------- Små komponenter ---------------- */

@Composable
private fun Toggle24(on: Boolean) {
    val p = HomelabTheme.colors
    Box(Modifier.size(44.dp, 26.dp).clip(RoundedCornerShape(13.dp)).background(if (on) p.success else p.line).padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
        Box(Modifier.size(20.dp).clip(CircleShape).background(Color.White))
    }
}

@Composable
private fun FieldLabel24(t: String) = Text(t, color = HomelabTheme.colors.textTertiary, style = HomelabType.footnote)

@Composable
private fun PillBtn24(text: String, modifier: Modifier, height: Dp, filled: Boolean = true, color: Color? = null, onClick: () -> Unit) {
    val p = HomelabTheme.colors
    Box(
        modifier.height(height).clip(RoundedCornerShape(height / 2)).background(if (filled) p.textPrimary else Color.Transparent)
            .then(if (filled) Modifier else Modifier.border(1.dp, p.line, RoundedCornerShape(height / 2))).clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = color ?: if (filled) p.surface else p.textPrimary, fontWeight = FontWeight.Bold, fontSize = if (height >= 46.dp) HomelabType.callout.fontSize else HomelabType.subheadline.fontSize, maxLines = 1) }
}

@Composable
private fun CatChip24(n: String, on: Boolean, c: Color, height: Dp, onClick: () -> Unit) {
    val p = HomelabTheme.colors
    Row(
        Modifier.height(height).clip(RoundedCornerShape(height / 2)).background(if (on) p.textPrimary else p.surfaceRaised).border(1.dp, if (on) p.textPrimary else p.line, RoundedCornerShape(height / 2))
            .clickable(onClick = onClick).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(c))
        Text(n, color = if (on) p.surface else p.textPrimary, fontWeight = FontWeight.SemiBold, style = HomelabType.footnote, maxLines = 1, softWrap = false)
    }
}

@Composable
private fun Input24(
    value: String, onChange: (String) -> Unit, placeholder: String, bg: Color = HomelabTheme.colors.surfaceRaised, mono: Boolean = false,
    weight: FontWeight = FontWeight.SemiBold, number: Boolean = false, height: Dp = 46.dp, size: TextUnit = 15.sp, onDone: (() -> Unit)? = null,
) {
    val p = HomelabTheme.colors
    BasicTextField(
        value, onChange, singleLine = true, modifier = Modifier.fillMaxWidth(),
        textStyle = TextStyle(color = p.textPrimary, fontSize = size, fontWeight = weight, fontFamily = if (mono) PaperFonts.mono else PaperFonts.sans),
        cursorBrush = SolidColor(p.textPrimary),
        keyboardOptions = KeyboardOptions(keyboardType = if (number) KeyboardType.Number else KeyboardType.Text, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }),
        decorationBox = { inner ->
            Box(Modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(14.dp)).background(bg).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp), contentAlignment = Alignment.CenterStart) {
                if (value.isEmpty() && placeholder.isNotEmpty()) Text(placeholder, color = p.textTertiary, fontSize = size, fontWeight = FontWeight.Medium, maxLines = 1)
                inner()
            }
        },
    )
}

@Composable
private fun ReceiptThumb24(vm: AppViewModel, folderId: Int, e: HomeEntry24, modifier: Modifier) {
    val p = HomelabTheme.colors
    Box(modifier.clip(RoundedCornerShape(8.dp)).background(p.surface).border(1.dp, p.line, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
        if (e.receiptId != null) ServerImage(vm, "/finans/api/folders/$folderId/receipts/${e.receiptId}/thumb", Modifier.matchParentSize()) {
            Text("⎙", color = p.textTertiary, style = HomelabType.body, modifier = Modifier.align(Alignment.Center))
        } else Text("⎙", color = p.textTertiary, style = HomelabType.body)
    }
}

/** Håndtaket øverst i bunnarkene (40 × 5, strekfarge), som i designet. */
@Composable
private fun Handle24() = Box(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 6.dp), contentAlignment = Alignment.Center) {
    Box(Modifier.size(40.dp, 5.dp).clip(RoundedCornerShape(3.dp)).background(HomelabTheme.colors.line))
}

private val SHEET24 = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)

/* ---------------- Bunnark ---------------- */

/** «Rediger bolig»: forhåndsvisning, Navn, Adresse, Budsjett, Farge (7 + fri), Bakgrunn (Farge / Strømstad / eget / Last opp), Lagre og Slett (to trykk). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditHomeSheet24(vm: AppViewModel, h: Home24, index: Int, count: Int) {
    val p = HomelabTheme.colors
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
        onDismissRequest = { s.edit = null }, sheetState = sheet, containerColor = p.surface, contentColor = p.textPrimary, shape = SHEET24, dragHandle = { Handle24() },
    ) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(16.dp, 0.dp, 16.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.fillMaxWidth().height(44.dp)) {
                PSerif("Rediger bolig", HomelabType.title3.fontSize, modifier = Modifier.align(Alignment.Center), maxLines = 1)
                Box(
                    Modifier.align(Alignment.CenterEnd).minimumInteractiveComponentSize().size(38.dp).clip(CircleShape).background(p.surfaceRaised).border(1.dp, p.line, CircleShape).clickable(role = Role.Button, onClickLabel = "Lukk") { s.edit = null },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Close, contentDescription = "Lukk", tint = p.textPrimary, modifier = Modifier.size(18.dp)) }
            }
            // Forhåndsvisning med bakgrunn og navn.
            Box(Modifier.fillMaxWidth().height(120.dp).clip(RoundedCornerShape(20.dp)).background(Brush.linearGradient(listOf(c, lerp(c, Color.Black, .3f)), Offset.Zero, Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)))) {
                when {
                    bg == "preset:stromstad" -> Image(painterResource(no.kristo.finanshub.R.drawable.bolig_stromstad), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
                    bg == own -> ownBmp?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
                }
                if (bg != "color") Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = .1f), Color.Black.copy(alpha = .5f)))))
                Text(name.ifBlank { h.name }, color = Color.White, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, style = HomelabType.title3, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.align(Alignment.BottomStart).padding(14.dp))
            }
            FieldLabel24("Navn"); Input24(name, { name = it.take(60) }, "")
            FieldLabel24("Adresse"); Input24(addr, { addr = it.take(120) }, "", weight = FontWeight.Medium)
            FieldLabel24("Budsjett per måned (kr)"); Input24(bud, { bud = it.filter { ch -> ch.isDigit() }.take(9) }, "", mono = true, number = true)
            FieldLabel24("Farge")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                HOME24_COLORS.forEach { k ->
                    Box(
                        Modifier.size(32.dp).clip(CircleShape).border(3.dp, if (col.equals(k, true)) p.textPrimary else Color.Transparent, CircleShape).padding(3.dp)
                            .border(2.dp, p.surface, CircleShape).clip(CircleShape).background(Color(color(k))).clickable { col = k },
                    )
                }
                Box(
                    Modifier.size(32.dp).clip(CircleShape).background(Brush.sweepGradient(listOf(0f, 60f, 120f, 190f, 240f, 285f, 360f).map { Color.hsv(it % 360f, .73f, 1f) }))
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
                                Modifier.fillMaxWidth().aspectRatio(1.6f).then(if (sel) Modifier.border(2.dp, p.textPrimary, RoundedCornerShape(14.dp)).padding(4.dp) else Modifier)
                                    .clip(RoundedCornerShape(12.dp))
                                    .then(if (o == null) Modifier.dashed24(p.line, 12.dp) else if (o.first == "color") Modifier.background(c) else Modifier.background(p.surfaceRaised))
                                    .clickable { if (o == null) runCatching { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) } else bg = o.first },
                                contentAlignment = Alignment.Center,
                            ) {
                                when {
                                    o == null -> if (uploading) CircularProgressIndicator(color = p.textTertiary, strokeWidth = 2.dp, modifier = Modifier.size(18.dp)) else Icon(Icons.Filled.Add, contentDescription = "Last opp eget bilde", tint = p.textTertiary, modifier = Modifier.size(22.dp))
                                    o.first == "preset:stromstad" -> Image(painterResource(no.kristo.finanshub.R.drawable.bolig_stromstad), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
                                    o.first == own -> ownBmp?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
                                }
                            }
                            Text(o?.second ?: "Last opp", color = p.textPrimary, fontWeight = FontWeight.SemiBold, style = HomelabType.footnote, maxLines = 1)
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
                    Modifier.fillMaxWidth().minimumInteractiveComponentSize().height(44.dp).clip(RoundedCornerShape(22.dp)).clickable(enabled = count > 1, role = Role.Button) {
                        if (!arm) arm = true else { arm = false; vm.b24DeleteHome(h.id) }
                    },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(if (count <= 1) "Kan ikke slette siste bolig" else if (arm) "Trykk igjen for å slette ${h.name}" else "Slett bolig", color = p.accent, fontWeight = FontWeight.Bold, style = HomelabType.callout)
                }
            }
        }
    }
}

/** Detaljer for en utgift: kvittering, beløp, AI-forklaring, kategori, Slett og Godkjenn/Lagre. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun EntrySheet24(vm: AppViewModel, d: HomeDetail24, e: HomeEntry24) {
    val p = HomelabTheme.colors
    val s = vm.b24
    val id = d.home.id
    var cat by remember(e.id) { mutableStateOf(e.category) }
    ModalBottomSheet(onDismissRequest = { s.sel = null }, containerColor = p.surface, contentColor = p.textPrimary, shape = SHEET24, dragHandle = { Handle24() }) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(18.dp, 0.dp, 18.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    PLabel(d.home.name + " · " + when (e.status) { "ok" -> "Godkjent"; "ai" -> "Leses av AI"; else -> "Til gjennomgang" }, size = HomelabType.caption.fontSize)
                    // Prompt 30: butikk/beskrivelse kan redigeres (lagres fortløpende).
                    if (d.canEdit && e.status != "ai") EntryTitle30(vm, id, e, Modifier.padding(top = 4.dp))
                    else PSerif(e.description, HomelabType.title3.fontSize, modifier = Modifier.padding(top = 4.dp), maxLines = 3)
                }
                SheetButton30("Ferdig") { s.sel = null }
            }
            // Prompt 52 (claude-code-kvittering-lokal-lik-overalt.md, mobil): samme kvitteringsvisning som Finans → transaksjon –
            // kortet (ReceiptHead52: logo, butikk, «kategori · dato · bolig», beløp, ✦ Glimt) og så «ORIGINAL KVITTERING».
            val rc52 by produceState<BoligRc52?>(null, id, e.id) { value = runCatching { parseBoligRc52(JSONObject(vm.api50 { get("/homes/$id/expenses/${e.id}") })) }.getOrNull() }
            ReceiptHead52(
                vm, null, e.description.substringBefore(" · "), e.color?.let { runCatching { color(it) }.getOrNull() } ?: DsPalette.Category.neutral.argbLong(),
                listOfNotNull(rc52?.category ?: e.category, ddmm24(e.date), d.home.name).joinToString(" · "),
                if (e.status == "ai") "…" else "−${kr24(e.amount)}", glimt = if (e.status == "ai") "Glimt leser lokalt …" else rc52?.glimt ?: e.aiShort, logoUrl = rc52?.logoUrl,
                extra = if (d.canEdit && e.status != "ai") { { EntryAmountDate30(vm, id, e); e.paidBy?.let { Text("Lagt til av $it", color = p.textTertiary, style = HomelabType.footnote) } } } else null,
            )
            PLabel("Original kvittering", modifier = Modifier.padding(start = 4.dp, top = 4.dp))
            val full52 = rc52?.fileUrl ?: e.receiptId?.let { "/finans/api/folders/$id/receipts/$it/file" }
            if (e.receiptId == null) Text("Ingen kvittering er lagt ved.", color = p.textTertiary, style = HomelabType.subheadline, modifier = Modifier.padding(start = 4.dp))
            else if (rc52 != null && rc52!!.lines.isNotEmpty()) ReceiptSlip52(e.description.substringBefore(" · "), e.date, rc52!!.lines, e.amount,
                onOpen = full52?.takeIf { rc52?.isPdf != true }?.let { u -> { vm.launch50 { vm.receiptFull = vm.image(u) } } })
            else Box(Modifier.fillMaxWidth().heightIn(min = 220.dp).clip(RoundedCornerShape(12.dp)).background(p.surfaceRaised).border(1.dp, p.line, RoundedCornerShape(12.dp))
                .clickable(enabled = full52 != null) { full52?.let { u -> vm.launch50 { vm.receiptFull = vm.image(u) } } }, contentAlignment = Alignment.Center) {
                ServerImage(vm, rc52?.thumbUrl ?: "/finans/api/folders/$id/receipts/${e.receiptId}/thumb", Modifier.matchParentSize())
            }
            FieldLabel24("Kategori")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                (d.cats.ifEmpty { CATS24.map { it.first } } + listOf(e.category)).distinct().forEach { n -> CatChip24(n, n == cat, catColor24(n, if (n == e.category) e.color else null), 34.dp) { cat = n } }
            }
            Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PillBtn24("Slett", Modifier.weight(1f), 46.dp, filled = false, color = p.accent) { vm.b24DeleteEntry(id, e.id) }
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
    val p = HomelabTheme.colors
    val s = vm.b24
    var n by remember { mutableStateOf("") }
    var a by remember { mutableStateOf("") }
    var b by remember { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = { s.newHome = false }, containerColor = p.surface, contentColor = p.textPrimary, shape = SHEET24, dragHandle = { Handle24() }) {
        Column(Modifier.fillMaxWidth().imePadding().padding(18.dp, 0.dp, 18.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif("Ny bolig", HomelabType.title3.fontSize, maxLines = 1)
            Input24(n, { n = it.take(60) }, "Navn, f.eks. Hytta")
            Input24(a, { a = it.take(120) }, "Adresse eller sted", weight = FontWeight.Medium)
            Input24(b, { b = it.filter { c -> c.isDigit() }.take(9) }, "Månedsbudsjett (kr)", mono = true, number = true)
            Text("Du blir eier. Du kan invitere andre etterpå.", color = p.textTertiary, style = HomelabType.footnote, lineHeight = 17.4.sp)
            PillBtn24(if (s.busy) "Oppretter …" else "Opprett bolig", Modifier.fillMaxWidth(), 48.dp) { if (n.isNotBlank() && !s.busy) vm.b24CreateHome(n, a, b) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun NewEntrySheet24(vm: AppViewModel, d: HomeDetail24) {
    val p = HomelabTheme.colors
    val s = vm.b24
    var m by remember { mutableStateOf("") }
    var a by remember { mutableStateOf("") }
    var c by remember { mutableStateOf("Annet") }
    var picked by remember { mutableStateOf(false) }
    val cats = (d.cats.ifEmpty { CATS24.map { it.first } } + "Annet").distinct()
    ModalBottomSheet(onDismissRequest = { s.newEntry = false }, containerColor = p.surface, contentColor = p.textPrimary, shape = SHEET24, dragHandle = { Handle24() }) {
        Column(Modifier.fillMaxWidth().imePadding().padding(18.dp, 0.dp, 18.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif("Ny utgift · ${d.home.name}", HomelabType.title3.fontSize, maxLines = 1)
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
    val p = HomelabTheme.colors
    Box(
        Modifier.minimumInteractiveComponentSize().height(40.dp).clip(RoundedCornerShape(20.dp)).background(p.surfaceRaised).clickable(role = Role.Button) { Haptics.select(); vm.b24.tab = "ov" }.padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) { Text("‹ Oversikt", color = p.textPrimary, fontWeight = FontWeight.Bold, style = HomelabType.subheadline, maxLines = 1, softWrap = false) }
}

/*
 * Prompt 30 (ANDROID30) – Boliger.dc.html: «Del boligen» med rutenett av brukere i Homelab som ikke har tilgang (avatar,
 * navn, relasjon; trykk for å velge flere), ROLLE (Eier · Kan laste opp · Kan se) og «Del med Ingrid og Pål». Uten valg:
 * e-post til noen utenfor Homelab. Og redigerbar butikk, beløp og dato i detaljarket (lagres fortløpende, 400 ms).
 */

private val ROLES30 = listOf("owner" to "Eier", "editor" to "Kan laste opp", "viewer" to "Kan se")
private fun roleHelp30(r: String) = when (r) { "owner" -> "Full tilgang, kan invitere og slette."; "viewer" -> "Ser oversikt og kvitteringer."; else -> "Legger til kvitteringer og utgifter." }
private val AVC30: List<Color> = DsPalette.Category.let { listOf(it.blue, it.amber, it.green, it.purple, it.red, it.neutral) }

/** Kortet «Del boligen» (bare eiere). invite = den gamle e-post-/navneinvitasjonen. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ShareHome30(vm: AppViewModel, d: HomeDetail24, invite: (String, String) -> Unit) {
    val p = HomelabTheme.colors
    val s = vm.p30
    val id = d.home.id
    LaunchedEffect(id) { vm.loadShareable30(id) }
    var email by remember(id) { mutableStateOf("") }
    val users = s.shareUsers.takeIf { s.shareFor == id }
    // Eldre server uten /users/shareable: bare e-post/navn som før.
    val old = s.shareErr == "old"
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.surfaceRaised).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        PSerif("Del boligen", HomelabType.headline.fontSize, maxLines = 1)
        if (!old) {
            Label30("BRUKERE I HOMELAB")
            when {
                users == null -> Text("Henter brukere …", color = p.textTertiary, style = HomelabType.subheadline)
                users.isEmpty() -> Text("Alle brukerne har allerede tilgang.", color = p.textTertiary, style = HomelabType.subheadline)
                else -> FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), maxItemsInEachRow = 3) {
                    users.forEachIndexed { i, u ->
                        val on = u.id in s.shareSel
                        Box(
                            Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(if (on) p.surface else Color.Transparent)
                                .border(1.5.dp, if (on) p.textPrimary else p.line, RoundedCornerShape(16.dp))
                                .clickable(role = Role.Checkbox, onClickLabel = u.name) { Haptics.select(); s.shareSel = if (on) s.shareSel - u.id else s.shareSel + u.id }
                                .padding(start = 6.dp, end = 6.dp, top = 12.dp, bottom = 10.dp),
                        ) {
                            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Box(Modifier.size(44.dp).clip(CircleShape).background(u.color?.let { Color(it) } ?: AVC30[i % AVC30.size]), contentAlignment = Alignment.Center) {
                                    Text(u.initial.take(2), color = Color.White, fontWeight = FontWeight.Bold, style = HomelabType.callout)
                                }
                                Text(u.name, color = p.textPrimary, fontWeight = FontWeight.Bold, style = HomelabType.subheadline, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(u.relation ?: " ", color = p.textTertiary, style = HomelabType.caption, fontWeight = FontWeight.Normal, maxLines = 1)
                            }
                            Box(Modifier.align(Alignment.TopEnd).padding(end = 0.dp).size(20.dp).alpha(if (on) 1f else 0f).clip(CircleShape).background(p.textPrimary), contentAlignment = Alignment.Center) {
                                WxIcon(IC_CHECK30, p.surface, 11.dp, stroke = 3.4f)
                            }
                        }
                    }
                    // Fyll siste rad så rutene får lik bredde.
                    repeat((3 - users.size % 3) % 3) { Box(Modifier.weight(1f)) }
                }
            }
        }
        Label30("ROLLE", Modifier.padding(top = 4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ROLES30.forEach { (k, n) ->
                val on = s.shareRole == k
                Box(
                    Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(18.dp)).background(if (on) p.textPrimary else Color.Transparent).border(1.dp, if (on) p.textPrimary else p.line, RoundedCornerShape(18.dp))
                        .clickable { s.shareRole = k; Haptics.select() },
                    contentAlignment = Alignment.Center,
                ) { Text(n, color = if (on) p.surface else p.textPrimary, fontWeight = FontWeight.Bold, style = HomelabType.footnote, maxLines = 1, softWrap = false) }
            }
        }
        Text(roleHelp30(s.shareRole), color = p.textTertiary, style = HomelabType.footnote, lineHeight = 17.4.sp)
        val sel = users.orEmpty().filter { it.id in s.shareSel }
        if (sel.isEmpty()) BasicTextField(
            email, { email = it }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            textStyle = HomelabType.callout.copy(color = p.textPrimary, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans),
            cursorBrush = SolidColor(p.textPrimary),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { if (email.isNotBlank()) { invite(email, s.shareRole); email = "" } }),
            decorationBox = { inner ->
                Box(Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(14.dp)).background(p.surface).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp), contentAlignment = Alignment.CenterStart) {
                    if (email.isEmpty()) Text(if (old) "Navn eller e-post" else "Eller e-post til noen utenfor Homelab", color = p.textTertiary, style = HomelabType.callout, maxLines = 1)
                    inner()
                }
            },
        )
        val label = when {
            sel.isNotEmpty() -> if (s.shareBusy) "Deler …" else "Del med " + share30Names(sel.map { it.name })
            else -> "Send invitasjon"
        }
        Box(
            Modifier.fillMaxWidth().minimumInteractiveComponentSize().height(46.dp).clip(RoundedCornerShape(23.dp)).background(p.textPrimary).clickable(role = Role.Button) {
                if (sel.isNotEmpty()) vm.shareHome30(id) else if (email.isNotBlank()) { invite(email, s.shareRole); email = "" }
            },
            contentAlignment = Alignment.Center,
        ) { Text(label, color = p.surface, fontWeight = FontWeight.Bold, style = HomelabType.callout, maxLines = 1) }
    }
}

@Composable
private fun Label30(t: String, modifier: Modifier = Modifier) =
    Text(t, color = HomelabTheme.colors.textTertiary, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, style = HomelabType.caption, letterSpacing = 1.3.sp, modifier = modifier)

private fun parseAmt30(s: String): Double? = s.replace(" ", "").replace(" ", "").replace(',', '.').toDoubleOrNull()
private fun fmtAmt30(v: Double): String = if (v % 1.0 == 0.0) v.toLong().toString() else String.format(java.util.Locale("nb", "NO"), "%.2f", v)

/** Butikk/beskrivelse som redigerbar tittel (serif 26, stiplet understrek). Lagres 400 ms etter siste tastetrykk. */
@Composable
internal fun EntryTitle30(vm: AppViewModel, homeId: Int, e: HomeEntry24, modifier: Modifier = Modifier) {
    val p = HomelabTheme.colors
    var t by remember(e.id) { mutableStateOf(e.description) }
    LaunchedEffect(t) {
        if (t.isBlank() || t == e.description) return@LaunchedEffect
        delay(400)
        vm.patchEntry30(homeId, e.id, t, null, null)
    }
    BasicTextField(
        t, { t = it }, modifier = modifier.fillMaxWidth().dashedLine30(p.line), maxLines = 3,
        textStyle = HomelabType.title3.copy(color = p.textPrimary, lineHeight = 30.sp, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium),
        cursorBrush = SolidColor(p.textPrimary), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
    )
}

/** Beløp (34, «kr», desimal med komma) og dato (datovelger). */
@Composable
internal fun EntryAmountDate30(vm: AppViewModel, homeId: Int, e: HomeEntry24) {
    val p = HomelabTheme.colors
    val ctx = LocalContext.current
    var a by remember(e.id) { mutableStateOf(fmtAmt30(e.amount)) }
    var date by remember(e.id) { mutableStateOf(e.date.take(10)) }
    LaunchedEffect(a) {
        val v = parseAmt30(a) ?: return@LaunchedEffect
        if (kotlin.math.abs(v - e.amount) < .005) return@LaunchedEffect
        delay(400)
        vm.patchEntry30(homeId, e.id, null, v, null)
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth().dashedLine30(p.line), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            BasicTextField(
                a, { v -> a = v.filter { it.isDigit() || it == ',' || it == '.' || it == ' ' } }, singleLine = true, modifier = Modifier.weight(1f),
                textStyle = HomelabType.title2.copy(color = p.textPrimary, lineHeight = 37.sp, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium),
                cursorBrush = SolidColor(p.textPrimary), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Done),
            )
            Text("kr", color = p.textTertiary, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, style = HomelabType.callout, modifier = Modifier.padding(bottom = 6.dp))
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Dato", color = p.textTertiary, style = HomelabType.subheadline)
            Box(
                Modifier.weight(1f).heightIn(min = 34.dp).clip(RoundedCornerShape(10.dp)).background(p.surfaceRaised).border(1.dp, p.line, RoundedCornerShape(10.dp))
                    .clickable(role = Role.Button, onClickLabel = "Velg dato") {
                        val d0 = runCatching { LocalDate.parse(date) }.getOrDefault(LocalDate.now())
                        android.app.DatePickerDialog(ctx, { _, y, m, dd ->
                            val nd = LocalDate.of(y, m + 1, dd).toString()
                            if (nd != date) { date = nd; Haptics.select(); vm.patchEntry30(homeId, e.id, null, null, nd) }
                        }, d0.year, d0.monthValue - 1, d0.dayOfMonth).show()
                    }.padding(horizontal = 10.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                val shown = runCatching { LocalDate.parse(date).let { String.format("%02d.%02d.%d", it.dayOfMonth, it.monthValue, it.year) } }.getOrDefault(date)
                Text(shown, color = p.textPrimary, fontWeight = FontWeight.SemiBold, style = HomelabType.subheadline)
            }
        }
    }
}

/** Stiplet linje under feltet (1,5 dp). */
private fun Modifier.dashedLine30(c: Color): Modifier = this.drawBehind {
    val y = size.height - 1.dp.toPx()
    drawLine(c, Offset(0f, y), Offset(size.width, y), 1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx())))
}

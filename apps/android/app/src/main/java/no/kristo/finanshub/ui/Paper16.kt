package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.DirectionsBus
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Vibration
import androidx.compose.material.icons.filled.ViewWeek
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/* ---------------- Små byggeklosser ---------------- */

internal val NB16: java.util.Locale = java.util.Locale.forLanguageTag("nb-NO")

/** Tekst som krymper til den får plass på én linje, i stedet for å kuttes eller få «…». */
@Composable
internal fun FitText(text: String, color: Color, size: TextUnit, weight: FontWeight = FontWeight.Normal, modifier: Modifier = Modifier, family: FontFamily? = null, min: TextUnit = 9.sp) {
    var s by remember(text, size) { mutableStateOf(size) }
    Text(
        text, color = color, fontSize = s, fontWeight = weight, fontFamily = family, maxLines = 1, softWrap = false, modifier = modifier,
        onTextLayout = { r -> if (r.hasVisualOverflow && s.value > min.value) s = (s.value * 0.92f).sp },
    )
}

/** Googles «G» i fire farger (søkefeltet på Hjem). */
@Composable
internal fun GoogleG(size: Dp = 18.dp) {
    Canvas(Modifier.size(size)) {
        val w = this.size.minDimension
        val st = w * 0.2f
        val r = (w - st) / 2f
        val tl = Offset(st / 2f, st / 2f)
        val sz = Size(r * 2, r * 2)
        drawArc(Color(0xFFEA4335), -150f, 105f, false, tl, sz, style = Stroke(st))
        drawArc(Color(0xFFFBBC05), 150f, 60f, false, tl, sz, style = Stroke(st))
        drawArc(Color(0xFF34A853), 45f, 105f, false, tl, sz, style = Stroke(st))
        drawArc(Color(0xFF4285F4), -45f, 90f, false, tl, sz, style = Stroke(st))
        drawLine(Color(0xFF4285F4), Offset(w / 2f, w / 2f), Offset(w - st / 2f, w / 2f), st, cap = StrokeCap.Butt)
    }
}

/** Ikon i farget rute (Innstillinger). Fargen følger fargetemaet brukeren har valgt. */
@Composable
internal fun IconTile(vm: AppViewModel, i: Int, icon: ImageVector) {
    val pal = iconPalette(vm.iconTheme)
    val c = Color(pal[((i % pal.size) + pal.size) % pal.size])
    Box(Modifier.size(32.dp).clip(RoundedCornerShape(9.dp)).background(c), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(18.dp))
    }
}

/** Rad i Innstillinger med farget ikon, tittel, undertekst og verdi. */
@Composable
internal fun SetRow(vm: AppViewModel, i: Int, icon: ImageVector, title: String, sub: String?, value: String = "›", top: Boolean = false, onClick: () -> Unit) {
    val p = PaperPal.current
    Column {
        if (top) Box(Modifier.fillMaxWidth().padding(start = 60.dp).height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().clickable(onClick = onClick).padding(14.dp, 11.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            IconTile(vm, i, icon)
            Column(Modifier.weight(1f)) {
                Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (!sub.isNullOrBlank()) Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Text(value, color = p.mut, fontSize = 13.sp, maxLines = 1)
        }
    }
}

/* ---------------- Innstillinger i Papir ---------------- */

/**
 * Innstillinger i Papir-stil: Profil øverst (trykk på profilbildet åpner hit), Utseende (tema, ikonfarger og bakgrunn,
 * som før lå i «Oslo ▾» på Hjem), Fanelinje, Moduler (Familie, Avganger, Vær, Nyhetsleser) og Konto.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun PaperSettings16(vm: AppViewModel, navBottom: Dp) {
    // Innstillinger → Utseende og fanelinje: tema, ikonfarger, bakgrunn på Hjem og fanelinjen.
    val p = PaperPal.current
    val own = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let(vm::uploadPhoto) }
    LaunchedEffect(Unit) { vm.loadPhotoThumbs() }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        item { PLabel("Utseende", modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
        item {
            PCard {
                val sel = "✓"
                SetRow(vm, 0, Icons.Filled.Palette, "Papir · lys", "Lyst papir og svart fanelinje", if (vm.paperMode == "lys") sel else "") { vm.setPaperMode("lys") }
                SetRow(vm, 1, Icons.Filled.Palette, "Papir · mørk", "Kveldspapir og lys fanelinje", if (vm.paperMode == "mork") sel else "", top = true) { vm.setPaperMode("mork") }
                SetRow(vm, 2, Icons.Filled.Palette, "Følg systemet", "Lys om dagen, mørk når telefonen er mørk", if (vm.paperMode == "auto") sel else "", top = true) { vm.setPaperMode("auto") }
                SetRow(vm, 3, Icons.Filled.Palette, "Klassisk (Material You)", "Bytt tilbake til det forrige mobildesignet", "Bytt ›", top = true) { vm.setMobileDesign("klassisk") }
            }
        }
        item { PLabel("Ikonfarger", modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
        item {
            PCard {
                FlowRow(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ICON_THEMES.forEach { (k, n) ->
                        val on = vm.iconTheme == k
                        Row(
                            Modifier.clip(RoundedCornerShape(14.dp)).border(if (on) 2.dp else 1.dp, if (on) p.ink else p.line, RoundedCornerShape(14.dp))
                                .clickable { Haptics.select(); vm.updateIconTheme(k) }.padding(10.dp, 8.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            iconPalette(k).take(4).forEach { c -> Box(Modifier.size(12.dp).clip(CircleShape).background(Color(c))) }
                            Text(n + if (on) " ✓" else "", color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
        item { PLabel("Bakgrunn på Hjem", modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
        item { PaperBgSettings(vm) { own.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) } }
        item { PLabel("Fanelinje", modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
        item {
            PCard {
                SetRow(vm, 1, Icons.Filled.ViewWeek, "Rediger fanelinjen", "Fjern faner, gi nytt navn og bytt ikon. Du kan også holde inne på linjen.", "›") { vm.tabEdit = true }
            }
        }
        item { Column(verticalArrangement = Arrangement.spacedBy(6.dp)) { PaperNavSettings(vm) } }
    }
}

/* ---------------- Fanelinja: rediger (hold inne på linja eller via Innstillinger) ---------------- */

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun TabBarEditor(vm: AppViewModel) {
    val p = PaperPal.current
    var items by remember { mutableStateOf(vm.tabBarItems()) }
    var iconFor by remember { mutableStateOf<String?>(null) }
    ModalBottomSheet(onDismissRequest = { vm.tabEdit = false }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(18.dp, 0.dp, 18.dp, 34.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif("Fanelinjen", 26.sp)
            Text("Fjern faner, gi dem nytt navn og velg ikon. «Mer» står alltid sist, og «Hjem» vises bare på Hjem.", color = p.mut, fontSize = 13.sp)
            PCard {
                items.forEachIndexed { i, t ->
                    Column {
                        if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                        Row(Modifier.fillMaxWidth().padding(10.dp, 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(
                                Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(if (iconFor == t.id) p.ink else p.surf2).clickable { iconFor = if (iconFor == t.id) null else t.id },
                                contentAlignment = Alignment.Center,
                            ) { GlyphIcon(t.icon, if (iconFor == t.id) p.bg else p.ink, 19.dp) }
                            BasicTextField(
                                t.label, { v -> items = items.map { if (it.id == t.id) it.copy(label = v.take(18)) else it } }, singleLine = true,
                                textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, fontFamily = PaperFonts.sans),
                                cursorBrush = SolidColor(p.lab),
                                modifier = Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).border(1.dp, p.line, RoundedCornerShape(10.dp)).padding(10.dp, 9.dp),
                            )
                            val mer = t.id == "mer"
                            EditDot("▲", !mer && i > 0) { items = items.toMutableList().also { l -> val x = l[i]; l[i] = l[i - 1]; l[i - 1] = x } }
                            EditDot("▼", !mer && i < items.size - 2) { items = items.toMutableList().also { l -> val x = l[i]; l[i] = l[i + 1]; l[i + 1] = x } }
                            EditDot("−", !mer && items.size > 2) { items = items.filter { it.id != t.id } }
                        }
                        if (iconFor == t.id) FlowRow(Modifier.fillMaxWidth().padding(10.dp, 0.dp, 10.dp, 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            TAB_ICONS.forEach { ic ->
                                Box(Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(if (ic == t.icon) p.ink else p.surf2)
                                    .clickable { items = items.map { if (it.id == t.id) it.copy(icon = ic) else it }; iconFor = null }, contentAlignment = Alignment.Center) {
                                    GlyphIcon(ic, if (ic == t.icon) p.bg else p.ink)
                                }
                            }
                        }
                    }
                }
            }
            val missing = MAIN_TABS.filter { m -> items.none { it.id == m.id } }
            if (missing.isNotEmpty() && items.size < 6) {
                PLabel("Legg til")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    missing.forEach { m ->
                        Box(Modifier.clip(CircleShape).border(1.dp, p.line, CircleShape).clickable {
                            items = items.filter { it.id != "mer" } + m + (items.firstOrNull { it.id == "mer" } ?: MAIN_TABS.first { it.id == "mer" })
                        }.padding(12.dp, 7.dp)) { Text("+ ${m.label}", color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PButton("Tilbakestill", Modifier.weight(1f), kind = "line") { vm.resetTabBar(); items = vm.tabBarItems() }
                PButton("Lagre", Modifier.weight(1f)) { vm.saveTabBar(items); vm.tabEdit = false }
            }
        }
    }
}

/* ---------------- Vær: egne steder ---------------- */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun WxPlacesSheet(vm: AppViewModel) {
    val p = PaperPal.current
    var q by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { if (vm.wxPlaces.isEmpty()) vm.loadWxPlaces() }
    ModalBottomSheet(onDismissRequest = { vm.wxPlacesSheet = false }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().padding(18.dp, 0.dp, 18.dp, 34.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif("Steder", 26.sp)
            Text("Søk etter et sted i Norge eller verden. Været kommer fra MET (yr.no).", color = p.mut, fontSize = 13.sp)
            PField("Sted", q, { q = it; vm.searchWxPlaces(it) }, placeholder = "Søk etter sted, f.eks. Lillehammer")
            if (vm.wxSearchBusy) LinearProgressIndicator(Modifier.fillMaxWidth(), color = p.ink, trackColor = p.line)
            if (vm.wxSearch.isNotEmpty()) PCard {
                vm.wxSearch.take(8).forEachIndexed { i, s ->
                    PRow(s.name, s.region.ifBlank { null }, "+ Legg til", p.lab, serif = false, top = i > 0) { vm.addWxPlace(s); q = "" }
                }
            }
            PLabel("Mine steder")
            PCard {
                if (vm.wxPlaces.isEmpty()) Text("Ingen steder ennå.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(16.dp))
                vm.wxPlaces.forEachIndexed { i, s ->
                    Column {
                        if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                        Row(Modifier.fillMaxWidth().clickable { vm.loadWeatherAt(s); vm.wxPlacesSheet = false }.padding(14.dp, 11.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(s.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                                if (s.region.isNotBlank()) Text(s.region, color = p.mut, fontSize = 12.5.sp, maxLines = 1)
                            }
                            if (vm.weatherPlace == s.id) Text("✓  ", color = p.ink, fontWeight = FontWeight.Bold)
                            Text("Fjern", color = p.lab, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clip(CircleShape).clickable { vm.removeWxPlace(s.id) }.padding(8.dp, 4.dp))
                        }
                    }
                }
            }
        }
    }
}

/* ---------------- Avganger: egen side i nyhetsleser-stil ---------------- */

private val ruterTime = DateTimeFormatter.ofPattern("HH:mm")
private fun clock(iso: String?): String = runCatching { Instant.parse(iso!!).atZone(ZoneId.systemDefault()).format(ruterTime) }.getOrDefault("")

/** Ruter-bildet øverst: Ruters røde flate med ordmerket og et stilisert bybilde. */
@Composable
private fun RuterHero(title: String, sub: String, onBack: () -> Unit) {
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    Box(Modifier.fillMaxWidth().height(200.dp + top).background(Brush.verticalGradient(listOf(Color(0xFFE60000), Color(0xFF9E0B0B))))) {
        Canvas(Modifier.matchParentSize()) {
            val w = size.width; val h = size.height
            // Stilisert bybilde og trikkeskinner nederst.
            val sky = Color.White.copy(alpha = .10f)
            var x = 0f
            var i = 0
            while (x < w) {
                val bw = w * (0.06f + (i % 3) * 0.025f)
                val bh = h * (0.18f + ((i * 37) % 5) * 0.05f)
                drawRect(sky, Offset(x, h - bh - 18f), Size(bw - 6f, bh))
                x += bw; i++
            }
            drawLine(Color.White.copy(alpha = .35f), Offset(0f, h - 12f), Offset(w, h - 12f), 3f)
            drawLine(Color.White.copy(alpha = .2f), Offset(0f, h - 4f), Offset(w, h - 4f), 2f)
        }
        Column(Modifier.fillMaxSize().padding(top = top + 8.dp, start = 22.dp, end = 22.dp, bottom = 34.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.height(34.dp).clip(CircleShape).background(Color(0x591B1A17)).clickable(onClick = onBack).padding(start = 10.dp, end = 14.dp), contentAlignment = Alignment.Center) {
                    Text("‹ Hjem", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                }
                Spacer(Modifier.weight(1f))
                Text("Ruter#", color = Color.White, fontWeight = FontWeight.Black, fontSize = 20.sp)
            }
            Spacer(Modifier.weight(1f))
            PSerif(sub, 15.sp, Color.White.copy(alpha = .9f), italic = true, weight = FontWeight.Normal, maxLines = 1)
            PSerif(title, 34.sp, Color.White, maxLines = 2)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun RuterPage(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val list = rememberLazyListState()
    BackHandler { if (vm.stopEdit) vm.stopEdit = false else vm.closeRuter() }
    LaunchedEffect(vm.stopSel) { list.scrollToItem(0) }
    val sel = vm.myStops.firstOrNull { it.id == vm.stopSel } ?: vm.myStops.firstOrNull()
    val deps = sel?.let { vm.stopDeps[it.id] }?.departures ?: emptyList()
    Box(Modifier.fillMaxSize().background(p.bg)) {
        LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(bottom = 40.dp)) {
            item { RuterHero(sel?.name ?: "Avganger", "Sanntid fra Ruter og Entur") { vm.closeRuter() } }
            // Stoppene: rulles sideveis og kuttes aldri. Hold inne for å redigere.
            item {
                Column(Modifier.fillMaxWidth().offset(y = (-22).dp).padding(horizontal = 16.dp)) {
                    PCard(shadow = true) {
                        Column(Modifier.padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(Modifier.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                                PLabel("Holdeplasser · ${vm.myStops.size}", modifier = Modifier.weight(1f))
                                Text(if (vm.stopEdit) "Ferdig" else "Rediger", color = p.lab, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.clip(CircleShape).clickable { Haptics.select(); vm.stopEdit = !vm.stopEdit }.padding(8.dp, 4.dp))
                            }
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                vm.myStops.forEachIndexed { i, st ->
                                    val on = st.id == sel?.id
                                    val angle = wobbleAngle(vm.stopEdit, i)
                                    Column(
                                        Modifier.graphicsLayer { rotationZ = angle * 3f }.widthIn(min = 120.dp).clip(RoundedCornerShape(14.dp))
                                            .background(if (on) p.ink else p.surf2)
                                            .longPressEdit(!vm.stopEdit) { Haptics.tap(); vm.stopEdit = true }
                                            .clickable(enabled = !vm.stopEdit) { Haptics.select(); vm.stopSel = st.id }.padding(12.dp, 10.dp),
                                        verticalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        Text(st.name, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, softWrap = false)
                                        Text(st.locality.ifBlank { vm.stopDeps[st.id]?.departures?.firstOrNull()?.let { "${it.line} ${it.to}" } ?: "Holdeplass" },
                                            color = if (on) p.bg.copy(alpha = .75f) else p.mut, fontSize = 11.5.sp, maxLines = 1, softWrap = false)
                                        if (vm.stopEdit) Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                            EditDot("◀", i > 0) { vm.moveStop(st.id, -1) }
                                            EditDot("▶", i < vm.myStops.size - 1) { vm.moveStop(st.id, 1) }
                                            EditDot("−", true) { vm.removeStop(st.id) }
                                        }
                                    }
                                }
                                // «+ Stopp»: kortbakgrunn og mørkere stiplet kant, så teksten er lesbar også over trikkebildet (prompt 20).
                                Box(Modifier.height(58.dp).clip(RoundedCornerShape(14.dp)).background(p.card).dashedEdge(p.mut, 14.dp).clickable { vm.stopAddOpen = true }.padding(horizontal = 16.dp),
                                    contentAlignment = Alignment.Center) { Text("+ Stopp", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp) }
                            }
                        }
                    }
                }
            }
            vm.stopsError?.let { e -> item { Text(e, color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(20.dp, 0.dp)) } }
            if (sel != null) item {
                Column(Modifier.padding(horizontal = 20.dp)) {
                    PHead("Neste avganger", "Oppdater ↻") { vm.refreshStops() }
                }
            }
            if (sel != null && deps.isEmpty() && vm.stopsError == null) item {
                Text("Henter avganger …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(20.dp, 14.dp))
            }
            items(deps.size) { i ->
                val d = deps[i]
                Column(Modifier.fillMaxWidth().clickable { openLink(ctx, ruterLink(sel?.name)) }.padding(20.dp, 0.dp)) {
                    Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.widthIn(min = 38.dp).height(28.dp).clip(RoundedCornerShape(7.dp)).background(Color(d.color ?: ruterModeColor(d.mode, d.line))).padding(horizontal = 6.dp),
                            contentAlignment = Alignment.Center) { Text(d.line, color = Color(d.textColor ?: 0xFFFFFFFF), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, maxLines = 1) }
                        Column(Modifier.weight(1f)) {
                            PSerif(d.to, 19.sp, if (d.cancelled) p.mut else p.ink, maxLines = 1)
                            val meta = listOfNotNull(
                                d.platform?.let { "Plattform $it" },
                                clock(d.expected ?: d.aimed).takeIf { it.isNotBlank() }?.let { t ->
                                    val aimed = clock(d.aimed)
                                    if (d.expected != null && aimed.isNotBlank() && aimed != t) "$t (rute $aimed)" else t
                                },
                                if (d.realtime) "● sanntid" else "rutetid",
                            ).joinToString(" · ")
                            Text(meta, color = if (d.realtime) p.pos else p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            d.situation?.let { Text("⚠ $it", color = p.lab, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                if (d.cancelled) "Innstilt" else d.minutes?.let { if (it <= 0) "nå" else "$it" } ?: clock(d.expected ?: d.aimed),
                                color = if (d.cancelled) p.lab else p.ink, fontFamily = PaperFonts.serif, fontSize = 26.sp,
                                textDecoration = if (d.cancelled) TextDecoration.LineThrough else null, maxLines = 1,
                            )
                            if (!d.cancelled && (d.minutes ?: 0) > 0) Text("min", color = p.mut, fontSize = 11.sp)
                        }
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                }
            }
            item {
                Text("Data: Entur · Trykk på en avgang for å åpne Ruter-appen", color = p.mut, fontSize = 11.5.sp, modifier = Modifier.fillMaxWidth().padding(20.dp, 16.dp))
            }
        }
    }
    if (vm.stopAddOpen) StopSearchSheet(vm)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StopSearchSheet(vm: AppViewModel) {
    val p = PaperPal.current
    var q by remember { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = { vm.stopAddOpen = false }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().padding(18.dp, 0.dp, 18.dp, 34.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif("Legg til stopp", 26.sp)
            Text("Søk i Ruter og Entur. Stoppene du legger til, viser ekte sanntid.", color = p.mut, fontSize = 13.sp)
            PField("Holdeplass", q, { q = it; vm.searchStops(it) }, placeholder = "F.eks. Jernbanetorget")
            if (vm.stopSearchBusy) LinearProgressIndicator(Modifier.fillMaxWidth(), color = p.ink, trackColor = p.line)
            if (vm.stopSearch.isNotEmpty()) PCard {
                vm.stopSearch.take(10).forEachIndexed { i, s ->
                    val modes = s.modes.joinToString(", ") { m -> when (m) { "metro" -> "T-bane"; "tram" -> "Trikk"; "bus" -> "Buss"; "water" -> "Båt"; "rail" -> "Tog"; else -> m } }
                    PRow(s.name, listOf(s.locality, modes).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { null }, "+", p.lab, serif = false, top = i > 0) { vm.addStop(s) }
                }
            } else if (q.length >= 2 && !vm.stopSearchBusy) Text("Ingen treff.", color = p.mut, fontSize = 13.sp)
        }
    }
}

/* ---------------- Boliger i Papir ---------------- */

private fun krB(v: Double) = "${neg0(v)} kr"

/** Boliger: velg bolig, se nøkkeltall, måned for måned, kategorier, prosjekter, faste regninger og utgifter. Last opp kvitteringer rett i boligen. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun PaperBoliger(vm: AppViewModel, navBottom: Dp, upload: () -> Unit) {
    val p = PaperPal.current
    LaunchedEffect(Unit) { if (vm.folders == null) vm.loadFolders() }
    val list = vm.folders
    val d = vm.folder
    LaunchedEffect(list) { if (d == null && !list.isNullOrEmpty()) vm.openFolder(list.first().id) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // Boligvelgeren ligger delvis oppe i bildeheaderen.
        item {
            PCard(shadow = true) {
                Column(Modifier.padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PLabel("Bolig · ${list?.size ?: 0}", modifier = Modifier.padding(horizontal = 14.dp))
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        (list ?: emptyList()).forEach { f ->
                            val on = d?.folder?.id == f.id
                            Column(Modifier.widthIn(min = 130.dp).clip(RoundedCornerShape(14.dp)).background(if (on) p.ink else p.surf2).clickable { Haptics.select(); vm.openFolder(f.id) }.padding(12.dp, 10.dp)) {
                                Text(f.name, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, softWrap = false)
                                Text("${krB(f.total)} · ${f.count} poster", color = if (on) p.bg.copy(alpha = .75f) else p.mut, fontSize = 11.5.sp, maxLines = 1, softWrap = false)
                            }
                        }
                    }
                }
            }
        }
        if (list == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
        else if (list.isEmpty()) item { PCard { Text("Ingen boliger ennå. Lag en bolig i FinansHub på nett under Innstillinger → Boliger.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(16.dp)) } }
        if (d != null) {
            item {
                Row(Modifier.fillMaxWidth().clip(CircleShape).border(1.dp, p.line, CircleShape).padding(3.dp)) {
                    listOf("oversikt" to "Oversikt", "utgifter" to "Utgifter", "prosjekter" to "Prosjekter", "regninger" to "Regninger").forEach { (k, n) ->
                        val on = vm.bolTab == k
                        Box(Modifier.weight(1f).height(36.dp).clip(CircleShape).background(if (on) p.ink else Color.Transparent).clickable { Haptics.select(); vm.bolTab = k }, contentAlignment = Alignment.Center) {
                            FitText(n, if (on) p.bg else p.ink, 13.sp, FontWeight.SemiBold)
                        }
                    }
                }
            }
            item {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.lab).clickable(onClick = upload).padding(16.dp, 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("Last opp kvittering til ${d.folder.name}", color = p.onLab, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("✦ AI velger kategori og underkategori", color = p.onLab.copy(alpha = .85f), fontSize = 12.sp)
                    }
                    Text("Skann ›", color = p.onLab, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
            }
            when (vm.bolTab) {
                "utgifter" -> {
                    item { PField("Søk", vm.bolSearch, { vm.bolSearch = it }, placeholder = "Søk i utgiftene") }
                    val q = vm.bolSearch.trim().lowercase()
                    val es = d.entries.filter { q.isBlank() || it.description.lowercase().contains(q) || (it.category ?: "").lowercase().contains(q) }
                    item {
                        PCard {
                            if (es.isEmpty()) Text("Ingen utgifter.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(16.dp))
                            es.take(80).forEachIndexed { i, e ->
                                Column {
                                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                                    Row(Modifier.fillMaxWidth().padding(14.dp, 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Column(Modifier.weight(1f)) {
                                            Text(e.description, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                            Text(listOfNotNull(e.date.take(10), e.categoryPath, e.paidBy).joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        }
                                        Text(krB(e.amount), color = p.ink, fontFamily = PaperFonts.mono, fontSize = 13.sp, maxLines = 1)
                                    }
                                }
                            }
                        }
                    }
                }
                "prosjekter" -> {
                    if (d.projects.isEmpty()) item { PCard { Text("Ingen prosjekter. Lag prosjekter på nett under Boliger.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(16.dp)) } }
                    items(d.projects.size) { i ->
                        val pr = d.projects[i]
                        val frac = if (pr.budget > 0) (pr.spent / pr.budget).toFloat().coerceIn(0f, 1.2f) else 0f
                        PCard {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(verticalAlignment = Alignment.Bottom) {
                                    PSerif(pr.name, 20.sp, modifier = Modifier.weight(1f), maxLines = 1)
                                    Text(if (pr.budget > 0) "${Math.round(frac * 100)} %" else "", color = if (frac > 1f) p.lab else p.mut, fontSize = 13.sp)
                                }
                                pr.vendor?.let { Text(it, color = p.mut, fontSize = 12.5.sp) }
                                Box(Modifier.fillMaxWidth().height(8.dp).clip(CircleShape).background(p.surf2)) {
                                    Box(Modifier.fillMaxWidth(frac.coerceAtMost(1f)).fillMaxHeight().clip(CircleShape).background(if (frac > 1f) p.lab else p.pos))
                                }
                                Row { Text("Brukt ${krB(pr.spent)}", color = p.ink, fontSize = 13.sp, modifier = Modifier.weight(1f)); Text("Budsjett ${krB(pr.budget)}", color = p.mut, fontSize = 13.sp) }
                                pr.installments.forEach { ins ->
                                    Row { Text((if (ins.paid) "✓ " else "○ ") + ins.label, color = if (ins.paid) p.mut else p.ink, fontSize = 12.5.sp, modifier = Modifier.weight(1f)); Text(krB(ins.amount), color = p.mut, fontSize = 12.5.sp) }
                                }
                            }
                        }
                    }
                }
                "regninger" -> {
                    if (d.bills.isEmpty()) item { PCard { Text("Ingen faste regninger.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(16.dp)) } }
                    item {
                        PCard {
                            d.bills.sortedBy { it.nextDue ?: "9999" }.forEachIndexed { i, b ->
                                Column {
                                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                                    Row(Modifier.fillMaxWidth().padding(14.dp, 11.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Column(Modifier.weight(1f)) {
                                            Text(b.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
                                            Text(listOfNotNull(b.nextDue?.let { "Neste ${it.take(10)}" }, b.freq, b.payer).joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 1)
                                        }
                                        b.amount?.let { Text(krB(it), color = p.ink, fontFamily = PaperFonts.mono, fontSize = 13.sp) }
                                    }
                                }
                            }
                        }
                    }
                }
                else -> {
                    // Nøkkeltall
                    item {
                        val thisMonth = java.time.LocalDate.now().toString().take(7)
                        val month = d.entries.filter { it.date.startsWith(thisMonth) }.sumOf { kotlin.math.abs(it.amount) }
                        val nextBill = d.bills.mapNotNull { b -> b.nextDue?.let { it to b } }.minByOrNull { it.first }
                        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf(
                                Triple("Totalt", krB(d.folder.total), "${d.folder.count} poster"),
                                Triple("Denne måneden", krB(month), java.time.LocalDate.now().month.getDisplayName(java.time.format.TextStyle.FULL, NB16)),
                                Triple("Neste regning", nextBill?.second?.amount?.let { krB(it) } ?: "–", nextBill?.let { "${it.second.name} ${it.first.take(10)}" } ?: "Ingen"),
                            ).forEach { (l, v, sub) ->
                                PCard(Modifier.weight(1f).fillMaxHeight()) {
                                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                        PLabel(l)
                                        FitText(v, p.ink, 18.sp, FontWeight.Medium, family = PaperFonts.serif)
                                        Text(sub, color = p.mut, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                    }
                                }
                            }
                        }
                    }
                    vm.folderExtra?.upcoming?.takeIf { it.isNotEmpty() }?.let { up ->
                        item {
                            PCard {
                                Column(Modifier.padding(top = 12.dp)) {
                                    PLabel("Kommende", modifier = Modifier.padding(horizontal = 14.dp))
                                    up.take(5).forEachIndexed { i, u ->
                                        if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                                        Row(Modifier.fillMaxWidth().padding(14.dp, 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                            Box(Modifier.size(10.dp).clip(CircleShape).background(Color(u.color ?: 0xFFB23A2A)))
                                            Column(Modifier.weight(1f)) {
                                                Text(u.title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                                Text(listOfNotNull(u.sub, u.days?.let { if (it <= 0) "i dag" else "om $it d" }).joinToString(" · "), color = if ((u.days ?: 9) <= 3) p.lab else p.mut, fontSize = 12.sp, maxLines = 1)
                                            }
                                            u.amount?.let { Text(krB(it), color = p.ink, fontFamily = PaperFonts.mono, fontSize = 13.sp) }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    vm.folderExtra?.receipts?.takeIf { it.isNotEmpty() }?.let { rs ->
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                PHead("Kvitteringer", "${rs.size}")
                                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    rs.take(20).forEach { r ->
                                        Column(Modifier.width(112.dp).clip(RoundedCornerShape(14.dp)).background(p.card)) {
                                            ServerImage(vm, r.thumbUrl, Modifier.fillMaxWidth().height(96.dp)) {
                                                Text("▤", color = p.mut, fontSize = 22.sp, modifier = Modifier.align(Alignment.Center))
                                            }
                                            Column(Modifier.padding(8.dp)) {
                                                Text(r.description, color = p.ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                                Text(if (r.pending) "✦ Leses …" else krB(r.amount), color = if (r.pending) p.lab else p.mut, fontSize = 11.sp, maxLines = 1)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    // Måned for måned (siste 6)
                    item {
                        val months = (5 downTo 0).map { java.time.YearMonth.now().minusMonths(it.toLong()) }
                        val sums = months.map { m -> d.entries.filter { it.date.startsWith(m.toString()) }.sumOf { kotlin.math.abs(it.amount) } }
                        val mx = (sums.maxOrNull() ?: 0.0).coerceAtLeast(1.0)
                        PCard {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                PLabel("Måned for måned")
                                Row(Modifier.fillMaxWidth().height(110.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
                                    months.forEachIndexed { i, m ->
                                        Column(Modifier.weight(1f).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Bottom) {
                                            Box(Modifier.fillMaxWidth().fillMaxHeight((sums[i] / mx).toFloat().coerceIn(0.02f, 0.82f)).clip(RoundedCornerShape(6.dp)).background(if (i == 5) p.lab else p.ink.copy(alpha = .75f)))
                                            Text(m.month.getDisplayName(java.time.format.TextStyle.SHORT, NB16).take(3), color = p.mut, fontSize = 10.5.sp, maxLines = 1)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if (d.categories.isNotEmpty()) item {
                        val total = d.categories.sumOf { it.amount }.coerceAtLeast(1.0)
                        val pal = iconPalette("fargerik")
                        PCard {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                PLabel("Kategorier")
                                Row(Modifier.fillMaxWidth().height(10.dp).clip(CircleShape)) {
                                    d.categories.forEachIndexed { i, c -> Box(Modifier.weight((c.amount / total).toFloat().coerceAtLeast(0.01f)).fillMaxHeight().background(Color(pal[i % pal.size]))) }
                                }
                                d.categories.take(8).forEachIndexed { i, c ->
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Box(Modifier.size(10.dp).clip(CircleShape).background(Color(pal[i % pal.size])))
                                        Text(c.name, color = p.ink, fontSize = 13.5.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text(krB(c.amount), color = p.mut, fontSize = 13.sp, fontFamily = PaperFonts.mono)
                                    }
                                }
                            }
                        }
                    }
                    if (d.balances.isNotEmpty()) item {
                        PCard {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                PLabel("Hvem har betalt")
                                d.balances.forEach { b ->
                                    Row { Text(b.name, color = p.ink, fontSize = 13.5.sp, modifier = Modifier.weight(1f)); Text("${krB(b.paid)} · ${if (b.balance >= 0) "+" else ""}${krB(b.balance)}", color = if (b.balance < 0) p.lab else p.pos, fontSize = 13.sp) }
                                }
                            }
                        }
                    }
                    item {
                        PHead("Siste utgifter", "Alle ›") { vm.bolTab = "utgifter" }
                    }
                    item {
                        PCard {
                            d.entries.take(6).forEachIndexed { i, e ->
                                Column {
                                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                                    Row(Modifier.fillMaxWidth().padding(14.dp, 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Column(Modifier.weight(1f)) {
                                            Text(e.description, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                            Text(listOfNotNull(e.date.take(10), e.categoryPath).joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        }
                                        Text(krB(e.amount), color = p.ink, fontFamily = PaperFonts.mono, fontSize = 13.sp)
                                    }
                                }
                            }
                            if (d.entries.isEmpty()) Text("Ingen utgifter ennå. Skann en kvittering, så havner den her.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(16.dp))
                        }
                    }
                }
            }
        }
    }
}

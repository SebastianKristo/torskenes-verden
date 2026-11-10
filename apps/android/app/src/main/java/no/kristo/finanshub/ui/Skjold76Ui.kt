package no.kristo.finanshub.ui

import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 76 (SKJAND): Skjold Lab-siden (Mer → Skjold Lab, finanshub://skjold). Papir-design som resten av Homelab.
 *  - Søk øverst med forslag, filter (Lavt lager, kategorier, skap), treffliste med bilde, specs, antall og plassering.
 *  - Detalj: stort bilde, plassering i tegningen (uthevet skuff med puls i 2 s – bare opacity), antall ±, Flytt / Endre / Slett.
 *  - Tegning av skapet: mørk ramme og lyse skuffer med håndtak; rad og skuff merket med tall. Med bilde + hjørner: «Tegning / Bilde»,
 *    der rutenettet legges perspektivisk over bildet med android.graphics.Matrix.setPolyToPoly (projektiv transform, ikke affin).
 *  - Skap-oppsett: bilde (kamera/fil), dra de 4 hjørnehåndtakene, rader/kolonner, navn og type. Tilleggsskap (3D-print) foreslår 12 × 4 (27 cm).
 */

private val FRAME76 = Color(0xFF1D1E20)
private val DRAWER76 = Color(0xFFE4EBEE)
private val DRAWER_USED76 = Color(0xFFD3E2EA)
private val HANDLE76 = Color(0xFF8D9AA1)
private val UNITS76 = listOf("stk", "m", "g", "pk", "sett")
private val SPEC_KEYS76 = listOf("verdi", "toleranse", "pakke", "spenning", "størrelse", "lengde")

@Composable
internal fun SkjoldPage76(vm: AppViewModel) {
    val s = Skjold76
    val p = PaperPal.current
    BackHandler { vm.closeSkjold76() }
    Box(Modifier.fillMaxSize().background(p.bg).clickable(remember { androidx.compose.foundation.interaction.MutableInteractionSource() }, null) {}) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Header76(vm)
            when {
                s.missing -> Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    PSerif("Skjold Lab finnes ikke på serveren ennå", 22.sp)
                    Text("Oppdater Homelab for å få sorteringssystemet for deler.", color = p.mut, fontSize = 14.sp)
                    PButton("‹ Tilbake", kind = "line", height = 44.dp) { vm.closeSkjold76() }
                }
                else -> when (s.screen) {
                    "part" -> PartScreen76(vm)
                    "edit" -> EditScreen76(vm)
                    "cab" -> CabScreen76(vm)
                    "setup" -> SetupScreen76(vm)
                    "tidy" -> TidyScreen77(vm) // prompt 77
                    "leds" -> LedScreen78(vm) // prompt 78
                    "pick" -> PickScreen79(vm) // prompt 79: plukklista
                    "projects" -> ProjectsScreen82(vm) // prompt 82: produkter
                    "project" -> ProjectScreen82(vm) // prompt 82: stykkliste
                    else -> ListScreen76(vm)
                }
            }
        }
        UndoBar76(vm, Modifier.align(Alignment.BottomCenter))
        if (s.undo == null) LitBar78(vm, Modifier.align(Alignment.BottomCenter)) // prompt 78: «Lyser i skapet» + Slå av
        if (s.undo == null) PickBar79(vm, Modifier.align(Alignment.BottomCenter)) // prompt 79: plukklistelinja (tar over for LitBar78)
        s.cabDeleteAsk?.let { CabDeleteAsk76(vm, it) }
        if (Skjold81.newAsk) NewPresetAsk81(vm) // prompt 81
        CheckoutSheet82(vm) // prompt 82: «Sjekk ut»
        Menu77(vm) // prompt 77: ⋯ → Rydd opp med Glimt / innstillinger
        Settings77(vm)
    }
}

@Composable
private fun Header76(vm: AppViewModel) {
    val s = Skjold76
    val p = PaperPal.current
    val ctx = LocalContext.current
    Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Pill76(if (s.stack.size > 1) "‹ Tilbake" else "‹ Mer", on = true) { vm.closeSkjold76() }
        PSerif(when (s.screen) { "part" -> "Del"; "edit" -> if (s.draft?.id == null) "Ny del" else "Endre del"; "cab" -> "Skap"; "setup" -> "Skap-oppsett"; "tidy" -> "Rydd opp"; "leds" -> "LED-oppsett"; "pick" -> "Plukkliste"; "projects" -> "Produkter"; "project" -> "Produkt"; else -> "Skjold Lab" },
            22.sp, maxLines = 1, modifier = Modifier.weight(1f))
        if (s.screen == "list" || s.screen == "cab") {
            Pill76("Etiketter", on = false) { vm.printLabels76(ctx, if (s.screen == "cab") s.cabId else null) }
            Pill76("+ Ny del", on = false) { vm.newPart76() }
        }
        if (s.screen == "list") Pill76("⋯", on = false, Modifier.semantics { contentDescription = "Flere valg" }) { Skjold77.menuOpen = true }
        if (s.screen == "edit") Pill76("⚙", on = false, Modifier.semantics { contentDescription = "Innstillinger for Glimt i Skjold Lab" }) { Skjold77.settingsOpen = true; vm.loadAiSettings77() }
    }
    if (s.offline) Text("Uten nett · viser lagret liste" + (s.cachedAt?.let { " fra " + java.text.SimpleDateFormat("d.M. HH:mm", java.util.Locale("nb", "NO")).format(java.util.Date(it)) } ?: "") + ". Endringer krever nett.",
        color = p.ink, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(p.tertiary).padding(10.dp, 6.dp))
}

@Composable
private fun Pill76(t: String, on: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(modifier.heightIn(min = 40.dp).clip(CircleShape).background(if (on) p.ink else Color.Transparent).border(1.dp, if (on) p.ink else p.line, CircleShape)
        .clickable(role = Role.Button) { Haptics.select(); onClick() }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
        Text(t, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1)
    }
}

/* ---------------- Liste og søk ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ListScreen76(vm: AppViewModel) {
    val s = Skjold76
    val p = PaperPal.current
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item(key = "q") { Search76(vm) }
        item(key = "chips") {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                PChip("Alle", s.cat == null && !s.low && s.filterCab == null) { s.cat = null; s.low = false; s.filterCab = null; vm.searchSkjold76(now = true) }
                PChip("Lavt lager", s.low) { s.low = !s.low; vm.searchSkjold76(now = true) }
                s.cabinets.takeIf { it.size > 1 }?.forEach { c -> PChip(c.name, s.filterCab == c.id) { s.filterCab = if (s.filterCab == c.id) null else c.id; vm.searchSkjold76(now = true) } }
                s.cats.forEach { c -> PChip(c.name, s.cat == c.name, c.count.toString()) { s.cat = if (s.cat == c.name) null else c.name; vm.searchSkjold76(now = true) } }
            }
        }
        // Skapene øverst (når det ikke søkes): liten tegning, trykk åpner skapet.
        if (s.q.isBlank()) item(key = "cabs") {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                s.cabinets.forEach { c ->
                    PCard(Modifier.width(150.dp), shadow = true, onClick = { s.cabId = c.id; s.drawer = null; push76("cab"); vm.loadMap76(c.id) }) {
                        Box(Modifier.padding(10.dp).height(120.dp).fillMaxWidth(), contentAlignment = Alignment.Center) { MiniCab76(c, s.maps[c.id]) }
                        Text(c.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 10.dp))
                        Text("${c.rows} × ${c.cols} · ${c.parts} deler", color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(start = 10.dp, end = 10.dp, bottom = 10.dp))
                    }
                }
                NewPresetCard81() // prompt 81: «Skjold Lab-hylla (3D)»
                PCard(Modifier.width(150.dp), onClick = { newCab76(vm, threeD = true) }) {
                    Column(Modifier.height(186.dp).fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("+", color = p.lab, fontSize = 28.sp)
                        Text("Legg til skap", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        Text("f.eks. tilleggsskap (3D-print)", color = p.mut, fontSize = 12.sp, textAlign = TextAlign.Center)
                    }
                }
            }
        }
        if (s.q.isBlank()) item(key = "projects") { ProjectsEntry82(vm) } // prompt 82: produkter
        s.err?.let { e -> item(key = "err") { Text(e, color = p.lab, fontSize = 13.sp) } }
        val l = s.items
        if (l == null) item(key = "load") { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
        else {
            item(key = "head") { PHead(if (s.q.isBlank()) "Deler" else "Treff", "${s.total}") }
            item(key = "hitsled") { HitsLed78(vm) } // prompt 78: vis treffene i skapet
            if (l.isEmpty()) item(key = "none") {
                Text(if (s.q.isBlank()) "Ingen deler ennå. Trykk «+ Ny del»." else "Ingen deler heter «${s.q.trim()}».", color = p.mut, fontSize = 14.sp, modifier = Modifier.padding(8.dp))
            }
            items(l, key = { "p" + it.id }) { pt -> PartRow76(vm, pt) }
        }
    }
}

@Composable
private fun Search76(vm: AppViewModel) {
    val s = Skjold76
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().heightIn(min = 50.dp).shadow(6.dp, RoundedCornerShape(25.dp)).clip(RoundedCornerShape(25.dp)).background(p.card).padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Text("⌕", color = p.mut, fontSize = 18.sp)
            Box(Modifier.weight(1f).padding(start = 8.dp)) {
                if (s.q.isEmpty()) Text("Søk etter deler, f.eks. M3, 10k, ESP32", color = p.mut, fontSize = 15.sp, maxLines = 1)
                BasicTextField(s.q, { vm.suggestSkjold76(it) }, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 15.sp), cursorBrush = SolidColor(p.lab),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { s.suggest = emptyList(); vm.searchSkjold76(now = true) }),
                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Søk i Skjold Lab" })
            }
            if (s.busy) CircularProgressIndicator(color = p.mut, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
            if (s.q.isNotEmpty()) Text("✕", color = p.mut, modifier = Modifier.semantics { contentDescription = "Tøm søket" }.size(40.dp).clip(CircleShape)
                .clickable { s.q = ""; s.suggest = emptyList(); vm.searchSkjold76(now = true) }.wrapContentSize())
        }
        if (s.suggest.isNotEmpty()) Column(Modifier.fillMaxWidth().padding(top = 4.dp).shadow(8.dp, RoundedCornerShape(16.dp)).clip(RoundedCornerShape(16.dp)).background(p.pop)) {
            s.suggest.forEach { (t, id, sub) ->
                Column(Modifier.fillMaxWidth().clickable {
                    s.suggest = emptyList()
                    if (id != null) vm.openPart76(id) else { s.q = t; vm.searchSkjold76(now = true) }
                }.padding(16.dp, 10.dp)) {
                    Text(t, color = p.ink, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    sub?.let { Text(it, color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                }
            }
        }
    }
}

@Composable
private fun PartRow76(vm: AppViewModel, pt: SkjPart76) {
    val p = PaperPal.current
    PCard(onClick = { Haptics.tap(); vm.openPart76(pt.id) }) {
        Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Img76(vm, pt.thumbUrl ?: pt.photos.firstOrNull(), 200, Modifier.size(56.dp).clip(RoundedCornerShape(12.dp)))
            Column(Modifier.weight(1f)) {
                Text(pt.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                val sp = pt.specs.joinToString(" · ") { it.second }
                if (sp.isNotBlank() || pt.category != null) Text(listOfNotNull(pt.category, sp.takeIf { it.isNotBlank() }).joinToString(" · "), color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(pt.loc.text, color = if (pt.loc.placed) p.sub else p.lab, fontSize = 12.5.sp, fontFamily = PaperFonts.mono, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            RowLed78(vm, pt) // prompt 78
            PickBtn79(vm, pt) // prompt 79: + / ✓ plukkliste
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("${qtyText76(pt.qty)} ${pt.unit}", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
                if (pt.low) LowBadge76()
                if (pt.loc.placed) Text(short76(pt.loc.row!!, pt.loc.col!!), color = p.bg, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 12.sp,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(p.ink).padding(6.dp, 2.dp))
            }
        }
    }
}

@Composable
private fun LowBadge76() {
    val p = PaperPal.current
    Text("Lavt", color = p.onLab, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(p.lab).padding(6.dp, 2.dp))
}

/** Bilde fra serveren (Img50: diskcache og token bare til egen server). Plassholder med skuff-ikon. */
@Composable
internal fun Img76(vm: AppViewModel, url: String?, maxPx: Int, modifier: Modifier, crop: Boolean = true, onBmp: ((Bitmap) -> Unit)? = null) {
    val ctx = LocalContext.current
    val p = PaperPal.current
    var bmp by remember(url) { mutableStateOf(Img50.cached(vm.base, url)) }
    LaunchedEffect(url) { if (url != null && bmp == null) Img50.load(ctx, vm.base, vm.account?.token, url, maxPx)?.let { bmp = it } }
    LaunchedEffect(bmp) { bmp?.let { onBmp?.invoke(it) } }
    Box(modifier.background(p.surf2), contentAlignment = Alignment.Center) {
        val b = bmp
        if (b != null) Image(b.asImageBitmap(), null, contentScale = if (crop) ContentScale.Crop else ContentScale.Fit, modifier = Modifier.matchParentSize())
        else Text("▤", color = p.mut, fontSize = 20.sp)
    }
}

/* ---------------- Detalj ---------------- */

@Composable
private fun PartScreen76(vm: AppViewModel) {
    val s = Skjold76
    val p = PaperPal.current
    val pt = s.part ?: run { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) }; return }
    var ask by remember(pt.id) { mutableStateOf(false) }
    var target by remember(pt.id) { mutableStateOf<Triple<String, Int, Int>?>(null) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val photos = pt.photos.ifEmpty { listOfNotNull(pt.thumbUrl) }
        if (photos.isEmpty()) Img76(vm, null, 0, Modifier.fillMaxWidth().height(160.dp).clip(RoundedCornerShape(20.dp)))
        else Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            photos.forEach { u -> Img76(vm, u, 1400, Modifier.size(if (photos.size == 1) 320.dp else 260.dp, 240.dp).clip(RoundedCornerShape(20.dp)), crop = false) }
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            PSerif(pt.name, 26.sp)
            if (pt.category != null) PLabel(pt.category)
            if (pt.specs.isNotEmpty()) Text(pt.specs.joinToString("  ·  ") { "${it.first}: ${it.second}" }, color = p.sub, fontSize = 14.sp)
            pt.description?.let { Text(it, color = p.ink, fontSize = 14.sp) }
            if (pt.tags.isNotEmpty()) Text(pt.tags.joinToString(" ") { "#$it" }, color = p.mut, fontSize = 13.sp)
        }
        // Antall ±
        PCard(shadow = true) {
            Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    PLabel("Antall")
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("${qtyText76(pt.qty)} ${pt.unit}", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                        if (pt.low) LowBadge76()
                    }
                    pt.minQty?.let { Text("Min ${qtyText76(it)} ${pt.unit}", color = p.mut, fontSize = 12.sp) }
                }
                Round76("−", "Én færre") { vm.qtySkjold76(pt, delta = -1.0) }
                Round76("+", "Én mer") { vm.qtySkjold76(pt, delta = 1.0) }
            }
        }
        // Plassering + tegningen (uthevet skuff).
        PCard(shadow = true) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                PLabel("Plassering")
                Text(pt.loc.text, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                if (s.occupied.isNotEmpty()) Text("Obs: i samme skuff ligger også " + s.occupied.joinToString(", ") + ".", color = p.lab, fontSize = 13.sp)
                val cabId = if (s.pick == "move") (s.cabId ?: pt.loc.cabinetId) else (pt.loc.cabinetId ?: s.cabId)
                val cab = s.cabinets.firstOrNull { it.id == cabId }
                if (s.pick == "move") {
                    Text("Trykk på skuffen delen skal flyttes til.", color = p.mut, fontSize = 13.sp)
                    CabChips76(vm)
                }
                if (cab != null) {
                    val hl = if (s.pick == "move") target?.takeIf { it.first == cab.id }?.let { it.second to it.third } else if (pt.loc.cabinetId == cab.id && pt.loc.placed) pt.loc.row!! to pt.loc.col!! else null
                    CabView76(vm, cab, hl, maxH = 420.dp) { r, c -> if (s.pick == "move") { target = Triple(cab.id, r, c); Haptics.select() } else { s.cabId = cab.id; s.drawer = r to c; push76("cab"); vm.loadMap76(cab.id) } }
                }
                val t = target
                if (s.pick == "move" && t != null) {
                    val comps = s.maps[t.first]?.at(t.second, t.third)?.compartments ?: 1
                    var comp by remember(t) { mutableStateOf<Int?>(null) }
                    if (comps > 1) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { (1..comps).forEach { n -> PChip("Rom $n", comp == n) { comp = if (comp == n) null else n } } }
                    PButton("Flytt til ${drawerText81(t.first, t.second, t.third, comp)}", Modifier.fillMaxWidth()) { vm.moveSkjold76(pt, t.first, t.second, t.third, comp); target = null }
                }
            }
        }
        if (s.pick != "move") LocateButton78(vm, pt) // prompt 78: 💡 Vis i skapet
        if (s.pick != "move") PickBtn79(vm, pt, big = true) // prompt 79: legg i plukklista
        if (s.pick != "move") CheckoutBtn82(vm, pt) // prompt 82: sjekk ut til produkt
        UsedIn82(vm, pt) // prompt 82: «Brukt i»
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton(if (s.pick == "move") "Avbryt" else "Flytt", Modifier.weight(1f), kind = if (s.pick == "move") "line" else "ink") {
                if (s.pick == "move") { s.pick = null; target = null } else { s.pick = "move"; target = null }
            }
            PButton("Endre", Modifier.weight(1f), kind = "line") { vm.editPart76(pt) }
            PButton("Slett", Modifier.weight(1f), kind = "lab") { ask = true }
        }
        if (s.pick == "move" && pt.loc.placed) PButton("Ta ut av skapet («Uten plass»)", Modifier.fillMaxWidth(), kind = "line") { vm.moveSkjold76(pt, null, null, null, null) }
        if (ask) PCard {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Slette «${pt.name}»? Den kan hentes tilbake i 30 dager.", color = p.ink, fontSize = 14.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PButton("Slett", Modifier.weight(1f), kind = "lab") { ask = false; vm.deleteSkjold76(pt) }
                    PButton("Avbryt", Modifier.weight(1f), kind = "line") { ask = false }
                }
            }
        }
        // Lenke, pris og leverandør.
        if (pt.url != null || pt.price != null || pt.supplier != null) PCard {
            val ctx = LocalContext.current
            pt.supplier?.let { PRow("Leverandør", null, it, serif = false) }
            pt.price?.let { PRow("Pris", null, qtyText76(it) + " kr", serif = false, top = pt.supplier != null) }
            pt.url?.let { u -> PRow("Datablad / kjøp", u, "›", serif = false, top = pt.supplier != null || pt.price != null) { openLink(ctx, u) } }
        }
        if (pt.history.isNotEmpty()) {
            PHead("Historikk")
            pt.history.take(12).forEach { h ->
                Text(listOfNotNull(h.at.take(16).replace('T', ' '), h.action, listOfNotNull(h.from, h.to).joinToString(" → ").takeIf { it.isNotBlank() }).joinToString(" · "), color = p.mut, fontSize = 12.5.sp)
            }
        }
    }
}

@Composable
private fun Round76(t: String, desc: String, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.size(48.dp).clip(CircleShape).background(p.ink).clickable(role = Role.Button, onClickLabel = desc, onClick = onClick).semantics { contentDescription = desc },
        contentAlignment = Alignment.Center) { Text(t, color = p.bg, fontSize = 22.sp, fontWeight = FontWeight.Bold) }
}

@Composable
private fun CabChips76(vm: AppViewModel) {
    val s = Skjold76
    if (s.cabinets.size < 2) return
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        s.cabinets.forEach { c -> PChip(c.name, s.cabId == c.id) { s.cabId = c.id; if (s.maps[c.id] == null) vm.loadMap76(c.id) } }
    }
}

/* ---------------- Tegningen ---------------- */

/** Liten tegning (oversikten): ingen tall, ingen trykk. */
@Composable
private fun MiniCab76(c: SkjCab76, m: SkjMap76?) {
    val ar = cabAspect76(c.rows, c.cols)
    Canvas(Modifier.fillMaxHeight().aspectRatio(ar)) { drawCab76(c.rows, c.cols, m, frame = 4.dp.toPx()) }
}

/** Skapets proporsjoner: skuff ca. 58 × 44 mm (Raaco 150-01). */
internal fun cabAspect76(rows: Int, cols: Int): Float = (cols * 58f + 12f) / (rows * 44f + 12f)

private fun DrawScope.drawCab76(rows: Int, cols: Int, m: SkjMap76?, frame: Float) {
    drawRoundRect(FRAME76, cornerRadius = CornerRadius(frame * 1.2f))
    val cw = (size.width - 2 * frame) / cols
    val ch = (size.height - 2 * frame) / rows
    val gap = (minOf(cw, ch) * .07f).coerceAtLeast(1f)
    // Prompt 81: ett felt per skuff (store/brede skuffer dekker flere ruter; dekkede ruter tegnes ikke).
    for (cell in cells81(rows, cols, m)) {
        val r = cell.row; val c = cell.col
        val x = frame + (c - 1) * cw + gap / 2; val y = frame + (r - 1) * ch + gap / 2
        val fw = cw * cell.spanC - gap; val fh = ch * cell.spanR - gap
        val used = cellCount81(m, cell) > 0
        drawRoundRect(if (used) DRAWER_USED76 else DRAWER76, Offset(x, y), Size(fw, fh), CornerRadius(gap))
        // Håndtak nederst på midten (samme størrelse som på en vanlig skuff).
        val hw = (cw - gap) * .36f * (if (cell.spanC > 1) 1.4f else 1f); val hh = ((ch - gap) * .14f).coerceAtLeast(1.5f)
        drawRoundRect(HANDLE76, Offset(x + (fw - hw) / 2, y + fh - (ch - gap) * .26f), Size(hw, hh), CornerRadius(hh / 2))
        if (used) drawCircle(Color(0xFF2B6FB3), radius = (minOf(cw, ch) * .07f).coerceAtLeast(1.5f), center = Offset(x + (cw - gap) * .14f, y + (ch - gap) * .2f))
    }
}

/** Puls i 2 s (bare opacity), starter på nytt når [key] endres. */
@Composable
private fun pulse76(key: Any?): Float {
    val reduce = reduceMotion45()
    val a = remember { Animatable(1f) }
    LaunchedEffect(key, Skjold76.pulse) {
        if (reduce || key == null) { a.snapTo(1f); return@LaunchedEffect }
        repeat(3) { a.animateTo(.25f, tween(330)); a.animateTo(1f, tween(330)) }
    }
    return a.value
}

/** Tegning / Bilde av skapet med uthevet skuff [hl] (rad, kol). Trykk på en skuff → [onTap]. */
@Composable
internal fun CabView76(vm: AppViewModel, cab: SkjCab76, hl: Pair<Int, Int>?, maxH: Dp = 460.dp, onTap: (Int, Int) -> Unit) {
    val s = Skjold76
    val p = PaperPal.current
    val canPhoto = cab.photoUrl != null && cab.corners != null
    LaunchedEffect(cab.id) { if (s.maps[cab.id] == null) vm.loadMap76(cab.id) }
    // Prompt 81: trykk på en dekket rute = ankeret; uthevingen gjelder ankeret (hele feltet).
    val m81 = s.maps[cab.id]
    val hlA = hl?.let { anchor81(m81, it.first, it.second) }
    val tapA: (Int, Int) -> Unit = { r, c -> anchor81(s.maps[cab.id], r, c).let { a -> onTap(a.first, a.second) } }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (canPhoto) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            PChip("Tegning", s.view != "photo") { s.view = "draw" }
            PChip("Bilde", s.view == "photo") { s.view = "photo" }
        }
        if (canPhoto && s.view == "photo") CabPhoto76(vm, cab, cab.corners!!, hlA, maxH, tapA)
        else CabDrawing76(cab, s.maps[cab.id], hlA, maxH, tapA)
        if (hlA != null) Text(drawerText81(cab.id, hlA.first, hlA.second) + "  (" + short76(hlA.first, hlA.second) + ")" + (s.maps[cab.id]?.at(hlA.first, hlA.second)?.label?.let { " · $it" } ?: ""),
            color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 13.sp)
    }
}

@Composable
private fun CabDrawing76(cab: SkjCab76, m: SkjMap76?, hl: Pair<Int, Int>?, maxH: Dp, onTap: (Int, Int) -> Unit) {
    val p = PaperPal.current
    val rows = m?.rows ?: cab.rows
    val cols = m?.cols ?: cab.cols
    val ar = cabAspect76(rows, cols)
    val pa = pulse76(hl)
    val frameDp = 6.dp
    val hc = hl?.let { cellOf81(m, rows, cols, it.first, it.second) } // prompt 81: feltet som uthevet skuff dekker
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val labelW = 22.dp
        val w = minOf(maxWidth - labelW, maxH * ar)
        val h = w / ar
        Column(Modifier.align(Alignment.Center)) {
            // Skuffnummer (kolonner) over tegningen.
            Row(Modifier.padding(start = labelW + frameDp, end = frameDp).width(w - frameDp * 2)) {
                for (c in 1..cols) Text("$c", Modifier.weight(1f), color = if (hc != null && c in hc.col until hc.col + hc.spanC) p.lab else p.mut, fontWeight = if (hc != null && c in hc.col until hc.col + hc.spanC) FontWeight.Bold else FontWeight.Normal,
                    fontFamily = PaperFonts.mono, fontSize = 11.sp, textAlign = TextAlign.Center)
            }
            Row {
                // Radnummer til venstre.
                Column(Modifier.width(labelW).height(h).padding(vertical = frameDp)) {
                    for (r in 1..rows) Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                        Text("$r", color = if (hc != null && r in hc.row until hc.row + hc.spanR) p.lab else p.mut, fontWeight = if (hc != null && r in hc.row until hc.row + hc.spanR) FontWeight.Bold else FontWeight.Normal, fontFamily = PaperFonts.mono, fontSize = 10.5.sp)
                    }
                }
                Box(Modifier.size(w, h).pointerInput(rows, cols) {
                    detectTapGestures { o ->
                        val f = frameDp.toPx()
                        cellAt76((o.x - f) / ((size.width - 2 * f) / cols), (o.y - f) / ((size.height - 2 * f) / rows), rows, cols)?.let { (r, c) -> Haptics.select(); onTap(r, c) }
                    }
                }.semantics { contentDescription = "Tegning av ${cab.name}, $rows rader og $cols skuffer" }) {
                    Canvas(Modifier.matchParentSize()) { drawCab76(rows, cols, m, frameDp.toPx()) }
                    if (hc != null) {
                        val lab = p.lab
                        // Rad- og kolonnebånd (fast) + skuffen (pulserer, bare opacity). Prompt 81: hele det sammenslåtte feltet.
                        Canvas(Modifier.matchParentSize()) {
                            val f = frameDp.toPx(); val cw = (size.width - 2 * f) / cols; val ch = (size.height - 2 * f) / rows
                            drawRect(lab.copy(alpha = .12f), Offset(f, f + (hc.row - 1) * ch), Size(size.width - 2 * f, ch * hc.spanR))
                            drawRect(lab.copy(alpha = .12f), Offset(f + (hc.col - 1) * cw, f), Size(cw * hc.spanC, size.height - 2 * f))
                        }
                        Canvas(Modifier.matchParentSize().graphicsLayer { alpha = pa }) {
                            val f = frameDp.toPx(); val cw = (size.width - 2 * f) / cols; val ch = (size.height - 2 * f) / rows
                            val o = Offset(f + (hc.col - 1) * cw, f + (hc.row - 1) * ch)
                            drawRoundRect(lab.copy(alpha = .55f), o, Size(cw * hc.spanC, ch * hc.spanR), CornerRadius(4.dp.toPx()))
                            drawRoundRect(lab, o, Size(cw * hc.spanC, ch * hc.spanR), CornerRadius(4.dp.toPx()), style = Stroke(2.5.dp.toPx()))
                        }
                    }
                }
            }
        }
    }
}

/** Projektiv avbildning fra skapets rutenett (0..cols, 0..rows) til de 4 hjørnene i bildet (px): setPolyToPoly med 4 punkter. */
internal fun persp76(corners: List<Offset>, rows: Int, cols: Int): android.graphics.Matrix {
    val m = android.graphics.Matrix()
    val src = floatArrayOf(0f, 0f, cols.toFloat(), 0f, cols.toFloat(), rows.toFloat(), 0f, rows.toFloat())
    val dst = floatArrayOf(corners[0].x, corners[0].y, corners[1].x, corners[1].y, corners[2].x, corners[2].y, corners[3].x, corners[3].y)
    m.setPolyToPoly(src, 0, dst, 0, 4)
    return m
}

private fun android.graphics.Matrix.pt76(x: Float, y: Float): Offset { val a = floatArrayOf(x, y); mapPoints(a); return Offset(a[0], a[1]) }

private fun quad76(m: android.graphics.Matrix, r: Int, c: Int, sr: Int = 1, sc: Int = 1): Path = Path().apply {
    val r2 = (r + sr - 1).toFloat(); val c2 = (c + sc - 1).toFloat() // prompt 81: felt over sr × sc ruter
    val a = m.pt76(c - 1f, r - 1f); val b = m.pt76(c2, r - 1f); val d = m.pt76(c2, r2); val e = m.pt76(c - 1f, r2)
    moveTo(a.x, a.y); lineTo(b.x, b.y); lineTo(d.x, d.y); lineTo(e.x, e.y); close()
}

private fun DrawScope.drawGrid76(m: android.graphics.Matrix, rows: Int, cols: Int, col: Color, w: Float) {
    for (r in 0..rows) drawLine(col, m.pt76(0f, r.toFloat()), m.pt76(cols.toFloat(), r.toFloat()), w)
    for (c in 0..cols) drawLine(col, m.pt76(c.toFloat(), 0f), m.pt76(c.toFloat(), rows.toFloat()), w)
}

@Composable
private fun CabPhoto76(vm: AppViewModel, cab: SkjCab76, corners: List<Pair<Float, Float>>, hl: Pair<Int, Int>?, maxH: Dp, onTap: (Int, Int) -> Unit) {
    val p = PaperPal.current
    var ar by remember(cab.photoUrl) { mutableStateOf(.6f) }
    val pa = pulse76(hl)
    val rows = cab.rows; val cols = cab.cols
    val m81 = Skjold76.maps[cab.id]?.takeIf { it.rows == rows && it.cols == cols } // prompt 81: felt fra kartet
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val w = minOf(maxWidth, maxH * ar)
        Box(Modifier.align(Alignment.Center).size(w, w / ar).clip(RoundedCornerShape(12.dp)).pointerInput(corners, rows, cols) {
            detectTapGestures { o ->
                val m = persp76(corners.map { Offset(it.first * size.width, it.second * size.height) }, rows, cols)
                val inv = android.graphics.Matrix()
                if (m.invert(inv)) { val g = inv.pt76(o.x, o.y); cellAt76(g.x, g.y, rows, cols)?.let { (r, c) -> Haptics.select(); onTap(r, c) } }
            }
        }.semantics { contentDescription = "Bilde av ${cab.name} med rutenettet lagt over" }) {
            Img76(vm, cab.photoUrl, 1600, Modifier.matchParentSize(), crop = false) { b -> if (b.height > 0) ar = b.width.toFloat() / b.height }
            Canvas(Modifier.matchParentSize()) {
                val m = persp76(corners.map { Offset(it.first * size.width, it.second * size.height) }, rows, cols)
                if (m81 == null) drawGrid76(m, rows, cols, Color.White.copy(alpha = .55f), 1.dp.toPx())
                else cells81(rows, cols, m81).forEach { cl -> drawPath(quad76(m, cl.row, cl.col, cl.spanR, cl.spanC), Color.White.copy(alpha = .55f), style = Stroke(1.dp.toPx())) }
            }
            if (hl != null) {
                val lab = p.lab
                Canvas(Modifier.matchParentSize().graphicsLayer { alpha = pa }) {
                    val m = persp76(corners.map { Offset(it.first * size.width, it.second * size.height) }, rows, cols)
                    val hc = cellOf81(m81, rows, cols, hl.first, hl.second)
                    val q = quad76(m, hc.row, hc.col, hc.spanR, hc.spanC)
                    drawPath(q, lab.copy(alpha = .5f))
                    drawPath(q, lab, style = Stroke(3.dp.toPx()))
                }
            }
        }
    }
}

/* ---------------- Skap ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CabScreen76(vm: AppViewModel) {
    val s = Skjold76
    val p = PaperPal.current
    val cab = s.cabinets.firstOrNull { it.id == s.cabId } ?: s.cabinets.firstOrNull()
    if (cab == null) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) }; return }
    val m = s.maps[cab.id]
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        CabChips76(vm)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                PSerif(cab.name, 24.sp, maxLines = 1)
                Text("${cab.rows} rader × ${cab.cols} skuffer · ${if (cab.kind == "3d") "3D-print" else "kjøpt"} · ${cab.parts} deler i ${cab.used} skuffer", color = p.mut, fontSize = 12.5.sp)
            }
            Pill76("Oppsett", on = false) { s.corners = null; push76("setup") }
            Spacer(Modifier.width(6.dp))
            LedPill78(vm, cab) // prompt 78
        }
        CabView76(vm, cab, s.drawer) { r, c -> s.drawer = if (s.drawer == (r to c)) null else r to c; s.pulse++ }
        s.drawer?.let { (r, c) -> DrawerCard76(vm, cab, m?.at(r, c), r, c) }
        s.drawer?.let { (r, c) -> DrawerLed78(vm, cab, r, c) } // prompt 78
        if (s.drawer == null) Text("Trykk på en skuff for å se hva som ligger der.", color = p.mut, fontSize = 13.sp)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DrawerCard76(vm: AppViewModel, cab: SkjCab76, d: SkjDrawer76?, r: Int, c: Int) {
    val p = PaperPal.current
    var label by remember(cab.id, r, c, d?.label) { mutableStateOf(d?.label ?: "") }
    var comps by remember(cab.id, r, c, d?.compartments) { mutableStateOf(d?.compartments ?: 1) }
    PCard(shadow = true) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    PLabel(drawerText81(cab.id, r, c) + " · " + short76(r, c))
                    PSerif(d?.label ?: defLabel76(r, c), 20.sp, maxLines = 1)
                }
                Text("${d?.count ?: 0} deler", color = p.mut, fontSize = 13.sp)
            }
            val parts = d?.parts.orEmpty()
            if (parts.isEmpty()) Text("Tom skuff.", color = p.mut, fontSize = 13.sp)
            parts.forEach { mp ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { vm.openPart76(mp.id) }.padding(4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Img76(vm, mp.thumbUrl, 160, Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)))
                    Text(mp.name, color = p.ink, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(qtyText76(mp.qty), color = p.mut, fontFamily = PaperFonts.mono, fontSize = 13.sp)
                }
            }
            PButton("+ Ny del i denne skuffen", Modifier.fillMaxWidth(), kind = "line") { vm.newPart76() }
            PField("Etikett", label, { label = it }, placeholder = defLabel76(r, c))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Rom", color = p.mut, fontSize = 13.sp)
                (1..4).forEach { n -> PChip("$n", comps == n) { comps = n } }
            }
            if (label != (d?.label ?: "") || comps != (d?.compartments ?: 1)) PButton("Lagre skuffen", Modifier.fillMaxWidth()) { vm.putDrawer76(cab.id, r, c, label, comps) }
            SpanRow81(vm, cab, d, r, c) // prompt 81: Bredde 1/2 · Høyde 1/2
        }
    }
}

internal fun newCab76(vm: AppViewModel, threeD: Boolean) { // prompt 81: også fra NewPresetAsk81
    val s = Skjold76
    // Tilleggsskap til ~27 cm bredde: samme radavstand (12 rader), 4 skuffer à ~60 mm.
    vm.saveCab76(null, if (threeD) "Tilleggsskap (3D-print)" else "Nytt skap", 12, if (threeD) suggestCols76(270) else 5, if (threeD) "3d" else "kjøpt") { id ->
        if (id != null) { s.cabId = id; s.stack = listOf("list", "cab", "setup") }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SetupScreen76(vm: AppViewModel) {
    val s = Skjold76
    val p = PaperPal.current
    val ctx = LocalContext.current
    val cab = s.cabinets.firstOrNull { it.id == s.cabId } ?: run { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) }; return }
    var name by remember(cab.id) { mutableStateOf(cab.name) }
    var rows by remember(cab.id) { mutableStateOf(cab.rows.toString()) }
    var cols by remember(cab.id) { mutableStateOf(cab.cols.toString()) }
    var kind by remember(cab.id) { mutableStateOf(cab.kind) }
    var shot by remember { mutableStateOf<Uri?>(null) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { u -> u?.let { vm.uploadCabPhoto76(cab.id, it) } }
    val cam = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) shot?.let { vm.uploadCabPhoto76(cab.id, it) } }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        PCard(shadow = true) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PField("Navn", name, { name = it })
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    PField("Rader", rows, { rows = it.filter(Char::isDigit).take(2) }, Modifier.weight(1f), keyboard = KeyboardOptions(keyboardType = KeyboardType.Number))
                    PField("Skuffer i bredden", cols, { cols = it.filter(Char::isDigit).take(2) }, Modifier.weight(1f), keyboard = KeyboardOptions(keyboardType = KeyboardType.Number))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    PChip("Kjøpt", kind != "3d") { kind = "kjøpt" }
                    PChip("3D-print", kind == "3d") { kind = "3d"; if (cab.parts == 0) { rows = "12"; cols = suggestCols76(270).toString() } }
                }
                if (kind == "3d") Text("Tilleggsskap til ca. 27 cm: 12 rader × ${suggestCols76(270)} skuffer à ~60 mm (se tools/skjoldlab3d). Mål ditt eget skap først.", color = p.mut, fontSize = 12.5.sp)
                PButton("Lagre", Modifier.fillMaxWidth()) {
                    vm.saveCab76(cab.id, name, rows.toIntOrNull() ?: cab.rows, cols.toIntOrNull() ?: cab.cols, kind)
                }
            }
        }
        PresetCard81(vm, cab) // prompt 81: «Bruk Skjold Lab-hylla (3D-print)»
        PHead("Bilde av skapet")
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton("Ta bilde", Modifier.weight(1f)) {
                val f = java.io.File(java.io.File(ctx.cacheDir, "scans").apply { mkdirs() }, "skap-${System.currentTimeMillis()}.jpg")
                val u = androidx.core.content.FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
                shot = u; cam.launch(u)
            }
            PButton("Velg bilde", Modifier.weight(1f), kind = "line") { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
        }
        if (s.busy) CircularProgressIndicator(color = p.ink, modifier = Modifier.align(Alignment.CenterHorizontally))
        if (cab.photoUrl != null) {
            Text("Dra de fire hjørnene til hjørnene på skapet. Rutenettet viser hvor skuffene havner.", color = p.mut, fontSize = 13.sp)
            val c = s.corners ?: cab.corners ?: listOf(.08f to .06f, .92f to .06f, .92f to .94f, .08f to .94f)
            CornerEditor76(vm, cab, c, (rows.toIntOrNull() ?: cab.rows).coerceIn(1, 40), (cols.toIntOrNull() ?: cab.cols).coerceIn(1, 20)) { s.corners = it }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("Lagre hjørnene", Modifier.weight(1f)) { vm.putCorners76(cab.id, c) }
                PButton("Fjern bildet", Modifier.weight(1f), kind = "line") { vm.deleteCabPhoto76(cab.id) }
            }
        }
        PHead("Skapet")
        PButton("💡 LED-oppsett", Modifier.fillMaxWidth(), kind = "line") { vm.openLeds78(cab.id) } // prompt 78
        PButton("Skriv ut etiketter", Modifier.fillMaxWidth(), kind = "line") { vm.printLabels76(ctx, cab.id) }
        PButton("Slett skapet", Modifier.fillMaxWidth(), kind = "lab") { vm.deleteCab76(cab) }
    }
}

/** Bildet med 4 hjørnehåndtak (tl, tr, br, bl) og forhåndsvisning av rutenettet. */
@Composable
private fun CornerEditor76(vm: AppViewModel, cab: SkjCab76, corners: List<Pair<Float, Float>>, rows: Int, cols: Int, onChange: (List<Pair<Float, Float>>) -> Unit) {
    val p = PaperPal.current
    var ar by remember(cab.photoUrl) { mutableStateOf(.6f) }
    var drag by remember { mutableStateOf(-1) }
    val cur by rememberUpdatedState(corners)
    val hitR = with(LocalDensity.current) { 44.dp.toPx() }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val w = minOf(maxWidth, 520.dp * ar)
        Box(Modifier.align(Alignment.Center).size(w, w / ar).clip(RoundedCornerShape(12.dp)).pointerInput(Unit) {
            detectDragGestures(
                onDragStart = { o ->
                    val d = cur.mapIndexed { i, c -> i to (Offset(c.first * size.width, c.second * size.height) - o).getDistance() }.minByOrNull { it.second }
                    drag = if (d != null && d.second < hitR) d.first else -1
                },
                onDragEnd = { drag = -1; Haptics.select() }, onDragCancel = { drag = -1 },
            ) { ch, dd ->
                val i = drag
                if (i >= 0) {
                    ch.consume()
                    val c = cur[i]
                    val n = ((c.first + dd.x / size.width).coerceIn(0f, 1f)) to ((c.second + dd.y / size.height).coerceIn(0f, 1f))
                    onChange(cur.mapIndexed { j, o -> if (j == i) n else o })
                }
            }
        }) {
            Img76(vm, cab.photoUrl, 1600, Modifier.matchParentSize(), crop = false) { b -> if (b.height > 0) ar = b.width.toFloat() / b.height }
            val lab = p.lab
            Canvas(Modifier.matchParentSize()) {
                val pts = corners.map { Offset(it.first * size.width, it.second * size.height) }
                drawGrid76(persp76(pts, rows, cols), rows, cols, lab.copy(alpha = .9f), 1.5.dp.toPx())
                pts.forEachIndexed { i, o ->
                    drawCircle(Color.White, 13.dp.toPx(), o)
                    drawCircle(if (i == drag) lab else Color(0xFF1B1A17), 9.dp.toPx(), o)
                }
            }
        }
    }
}

@Composable
private fun CabDeleteAsk76(vm: AppViewModel, c: SkjCab76) {
    val s = Skjold76
    val p = PaperPal.current
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .4f)).clickable { s.cabDeleteAsk = null }, contentAlignment = Alignment.Center) {
        PCard(Modifier.padding(24.dp).widthIn(max = 420.dp), shadow = true) {
            Column(Modifier.padding(16.dp).clickable(enabled = false) {}, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                PSerif("«${c.name}» har deler", 20.sp)
                Text("Hvor skal delene flyttes før skapet slettes?", color = p.mut, fontSize = 14.sp)
                s.cabinets.filter { it.id != c.id }.forEach { o -> PButton("Flytt til ${o.name}", Modifier.fillMaxWidth(), kind = "line") { vm.deleteCab76(c, o.id) } }
                PButton("Uten plass", Modifier.fillMaxWidth(), kind = "line") { vm.deleteCab76(c, "none") }
                PButton("Avbryt", Modifier.fillMaxWidth()) { s.cabDeleteAsk = null }
            }
        }
    }
}

/* ---------------- Ny / endre del ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EditScreen76(vm: AppViewModel) {
    val s = Skjold76
    val p = PaperPal.current
    val ctx = LocalContext.current
    val d = s.draft ?: run { LaunchedEffect(Unit) { vm.closeSkjold76() }; return }
    var shot by remember { mutableStateOf<Uri?>(null) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { u -> u?.let { vm.addPartPhoto76(it) } }
    val cam = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) shot?.let { vm.addPartPhoto76(it) } }
    val num = KeyboardOptions(keyboardType = KeyboardType.Decimal)
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 140.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        PCard(shadow = true) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PField("Navn", d.name, { d.name = it }, placeholder = "M3 × 10 skruer")
                SuggestBar77(vm, d) // prompt 77: ✦ Foreslå + kortet
                PField("Kategori", d.category, { d.category = it }, placeholder = "Skruer, motstander, LED …")
                if (s.cats.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    s.cats.take(14).forEach { c -> PChip(c.name, d.category == c.name) { d.category = c.name } }
                }
                PField("Beskrivelse", d.description, { d.description = it })
            }
        }
        PHead("Specs")
        d.specs.forEachIndexed { i, (k, v) ->
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PField("Felt", k, { t -> d.specs = d.specs.mapIndexed { j, o -> if (j == i) t to o.second else o } }, Modifier.weight(.42f))
                PField("Verdi", v, { t -> d.specs = d.specs.mapIndexed { j, o -> if (j == i) o.first to t else o } }, Modifier.weight(.58f), placeholder = if (k == "verdi") "10k" else "")
                Text("✕", color = p.mut, modifier = Modifier.size(40.dp).clip(CircleShape).clickable { d.specs = d.specs.filterIndexed { j, _ -> j != i } }.wrapContentSize()
                    .semantics { contentDescription = "Fjern feltet" })
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            SPEC_KEYS76.filter { k -> d.specs.none { it.first == k } }.forEach { k -> PChip("+ $k", false) { d.specs = d.specs + (k to "") } }
            PChip("+ annet", false) { d.specs = d.specs + ("" to "") }
        }
        PHead("Antall")
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PField("Antall", d.qty, { d.qty = it }, Modifier.weight(1f), keyboard = num)
            PField("Min (lavt lager)", d.minQty, { d.minQty = it }, Modifier.weight(1f), keyboard = num)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { UNITS76.forEach { u -> PChip(u, d.unit == u) { d.unit = u } } }
        PField("Tags (komma mellom)", d.tags, { d.tags = it }, placeholder = "rustfritt, DIN 912")
        PHead("Plassering")
        Text(locText81(d.cabinetId, s.cabinets.firstOrNull { it.id == d.cabinetId }?.name ?: "Skap", d.row, d.col, d.compartment), color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton("Foreslå ledig", Modifier.weight(1f)) { vm.suggestFree76(d) }
            PButton("Uten plass", Modifier.weight(1f), kind = "line") { d.cabinetId = null; d.row = null; d.col = null; d.compartment = null }
        }
        CabChips76(vm)
        val cab = s.cabinets.firstOrNull { it.id == (s.cabId ?: d.cabinetId) }
        if (cab != null) {
            Text("Trykk på skuffen i tegningen.", color = p.mut, fontSize = 13.sp)
            val hl = if (d.cabinetId == cab.id && d.row != null && d.col != null) d.row!! to d.col!! else null
            CabView76(vm, cab, hl, maxH = 380.dp) { r, c -> d.cabinetId = cab.id; d.row = r; d.col = c; d.compartment = null; s.pulse++ }
            val comps = if (d.row != null && d.col != null) s.maps[cab.id]?.at(d.row!!, d.col!!)?.compartments ?: 1 else 1
            if (comps > 1) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { (1..comps).forEach { n -> PChip("Rom $n", d.compartment == n) { d.compartment = if (d.compartment == n) null else n } } }
        }
        PHead("Bilder")
        val existing = if (d.id != null) s.part?.takeIf { it.id == d.id }?.photos.orEmpty() else emptyList()
        if (existing.isNotEmpty() || d.newPhotos.isNotEmpty()) Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            existing.forEachIndexed { i, u ->
                Box {
                    Img76(vm, u, 400, Modifier.size(96.dp).clip(RoundedCornerShape(14.dp)))
                    Text("✕", color = Color.White, fontSize = 13.sp, modifier = Modifier.align(Alignment.TopEnd).padding(4.dp).size(28.dp).clip(CircleShape).background(Color.Black.copy(alpha = .55f))
                        .clickable { val pp = s.part; d.id?.let { vm.deletePartPhoto76(it, pp?.photoNs?.getOrNull(i) ?: i) } }.wrapContentSize().semantics { contentDescription = "Slett bildet" })
                }
            }
            d.newPhotos.forEach { _ -> Box(Modifier.size(96.dp).clip(RoundedCornerShape(14.dp)).background(p.surf2), contentAlignment = Alignment.Center) { Text("Nytt bilde", color = p.mut, fontSize = 12.sp) } }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton("Ta bilde", Modifier.weight(1f), kind = "line") {
                val f = java.io.File(java.io.File(ctx.cacheDir, "scans").apply { mkdirs() }, "del-${System.currentTimeMillis()}.jpg")
                val u = androidx.core.content.FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
                shot = u; cam.launch(u)
            }
            PButton("Velg bilde", Modifier.weight(1f), kind = "line") { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
            FindImage77(vm, d, Modifier.weight(1f)) // prompt 77
        }
        ImagePicker77(vm, d)
        PHead("Kjøp")
        PField("URL (datablad/kjøp)", d.url, { d.url = it }, keyboard = KeyboardOptions(keyboardType = KeyboardType.Uri))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PField("Pris (kr)", d.price, { d.price = it }, Modifier.weight(1f), keyboard = num)
            PField("Leverandør", d.supplier, { d.supplier = it }, Modifier.weight(1f))
        }
        PButton(if (s.busy) "Lagrer …" else if (d.id == null) "Legg til delen" else "Lagre", Modifier.fillMaxWidth(), height = 52.dp) { if (!s.busy) vm.saveDraft76() }
    }
}

/* ---------------- Angre ---------------- */

@Composable
private fun UndoBar76(vm: AppViewModel, modifier: Modifier) {
    val u = Skjold76.undo ?: return
    val p = PaperPal.current
    Row(modifier.navigationBarsPadding().padding(16.dp).fillMaxWidth().widthIn(max = 560.dp).shadow(14.dp, RoundedCornerShape(18.dp)).clip(RoundedCornerShape(18.dp)).background(p.ink)
        .padding(start = 16.dp, end = 6.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(u.text, color = p.bg, fontSize = 14.sp, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
        Box(Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button) { Haptics.tap(); vm.runUndo76() }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text("Angre", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 14.sp, textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline)
        }
    }
}

/** «Åpne i Skjold Lab ›» under Glimt-svaret på Hjem (samme stil som «Åpne Vær ›»). */
@Composable
internal fun GlimtSkjold76(vm: AppViewModel, uri: String) {
    Box(Modifier.height(32.dp).clip(CircleShape).background(Color.White.copy(alpha = .14f)).clickable(role = Role.Button) { vm.skjoldLink76(Uri.parse(uri)) }.padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center) {
        Text("Åpne i Skjold Lab ›", color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
    }
}

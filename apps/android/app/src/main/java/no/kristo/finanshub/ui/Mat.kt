package no.kristo.finanshub.ui

import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate

/*
 * Mat (tidligere Matplan), design 2a i «Mat Varianter»: dagens rett på et limegrønt kort, uka som avisrader med
 * dagen i mono og retten i serif, mapper som piller, «Skann oppskrift» og «Importer lenke». Flatene følger appens
 * tema (Material You, frøfargen eller Papir), mens limegrønt (#D4F25A) og oransje (#FF8A4C) er designets egne aksenter.
 */

/** Fargene i Mat. Flatene kommer fra appens roller, så Mat følger tema og lys/mørk som resten av appen. */
internal data class MatPalette(
    val dark: Boolean, val bg: Color, val text: Color, val sub: Color, val muted: Color, val card: Color, val accent: Color,
    val lime: Color, val onLime: Color, val border: Color, val black: Color, val onBlack: Color, val row: Color, val label: Color,
)

@Composable
internal fun matPalette(@Suppress("UNUSED_PARAMETER") vm: AppViewModel): MatPalette = MatPalette(
    dark = !Tone.light, bg = C.bg, text = C.text, sub = C.text2, muted = C.outline, card = C.surface1, accent = Color(0xFFFF8A4C),
    lime = Color(0xFFD4F25A), onLime = Color(0xFF141A06), border = C.surface3, black = C.primary, onBlack = C.onPrimary, row = C.surface2,
    label = if (Tone.paper) PaperPal.current.lab else C.text2,
)

private val shortDay = listOf("MAN", "TIR", "ONS", "TOR", "FRE", "LØR", "SØN")
private val longDay = listOf("Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag")
private fun dayIdx(iso: String): Int = runCatching { LocalDate.parse(iso).dayOfWeek.value - 1 }.getOrDefault(0)

/** «Ingrid» → «Ingrids», «Hans» → «Hans'». */
private fun owner(n: String) = if (n.endsWith("s")) "$n'" else "${n}s"

@Composable
private fun MLabel(text: String, color: Color, modifier: Modifier = Modifier) =
    Text(text.uppercase(), color = color, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 1.3.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = modifier)

@Composable
private fun MSerif(text: String, size: Int, color: Color, modifier: Modifier = Modifier, maxLines: Int = 2) =
    Text(text, color = color, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = size.sp, lineHeight = (size * 1.1).sp, maxLines = maxLines, overflow = TextOverflow.Ellipsis, modifier = modifier)

@Composable
private fun MHead(label: String, right: String?, p: MatPalette) {
    Column(Modifier.fillMaxWidth().padding(top = 6.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp), verticalAlignment = Alignment.Bottom) {
            MLabel(label, p.label, Modifier.weight(1f).padding(bottom = 6.dp))
            right?.let { Text(it, color = p.muted, fontSize = 12.sp, modifier = Modifier.padding(bottom = 6.dp)) }
        }
        Box(Modifier.fillMaxWidth().height(2.dp).background(p.text))
    }
}

/** Mat på mobil. paper = i Papir-skallet (fotovinduet har tittelen og profilbildet). */
@Composable
internal fun MatSurface(vm: AppViewModel, paper: Boolean = false) {
    val p = matPalette(vm)
    val w = vm.week
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var linkOpen by remember { mutableStateOf(false) }
    LazyColumn(
        Modifier.fillMaxSize().background(if (paper) Color.Transparent else p.bg),
        contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, (if (paper) 104.dp else 48.dp) + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (!paper) {
            vm.topRowTitle(true)?.let { t -> item { TopBackRow(vm, t, p.text, p.card, p.border) } }
            item { MatHeader(vm, p) }
        }
        vm.moduleError?.let { e -> item { Text(e, color = p.accent, fontSize = 13.sp) } }
        if (w == null || w.days.isEmpty()) {
            if (vm.moduleError == null) item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.text) } }
        } else if (paper) {
            // Prompt 36: matplanen er felles for alle på serveren (ingen dele- eller privat-valg).
            item { MealNote36(vm, p) }
            // Papir: kortene kan flyttes og skjules (hold inne), og rekkefølgen lagres per bruker.
            pageSecs(vm, "mat", MAT_SECS) { k -> MatPaperSec(vm, w, k, p, linkOpen) { linkOpen = it } }
        } else {
            val todayIso = LocalDate.now().toString()
            val ti = w.days.indexOfFirst { it.today || it.date == todayIso }.coerceAtLeast(0)
            val today = w.days[ti]
            val todayDish = w.dishes.firstOrNull { it.id == today.dishId } ?: w.dishes.firstOrNull { it.name == today.name }
            item { TodayCard(vm, today, todayDish, p) { vm.matDay = ti; vm.dishOpen = todayDish?.id ?: "" } }
            item { MHead("Uka", w.week?.let { "Uke $it" }, p) }
            items(w.days.size) { i ->
                val d = w.days[i]
                val dish = w.dishes.firstOrNull { it.id == d.dishId } ?: w.dishes.firstOrNull { it.name == d.name }
                Column {
                    Row(
                        Modifier.fillMaxWidth().clickable { vm.matDay = i; vm.dishOpen = dish?.id ?: "" }.padding(2.dp, 8.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        MLabel(shortDay[dayIdx(d.date)], if (i == ti) p.accent else p.muted, Modifier.width(36.dp))
                        MSerif(d.name ?: "Ingen rett ennå", 18, if (d.name == null) p.muted else p.text, Modifier.weight(1f), maxLines = 1)
                        Text(listOfNotNull(d.cook, if (d.fixed) "fast" else null).joinToString(" · "), color = p.muted, fontSize = 12.sp, maxLines = 1)
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(p.border))
                }
            }
            item {
                Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MatButton("✦ Ny plan for uka", p, Modifier.weight(1f), accent = true) { vm.planWeek() }
                    MatButton("Hele uka", p, Modifier.weight(1f), outline = true) { vm.matFull = true }
                }
            }
            item { FolderChips(vm, p) }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MatButton("Skann oppskrift", p, Modifier.weight(1f)) { vm.scanTarget = "recipe"; vm.scanSheet = true }
                    MatButton("Importer lenke", p, Modifier.weight(1f), outline = true) { linkOpen = !linkOpen }
                }
            }
            if (linkOpen || vm.recipeBusy) item { ImportField(vm, p) { linkOpen = false } }
            if (vm.recipeJobs.isNotEmpty()) item { RecipeJobs(vm, p) }
            val sel = vm.matFolderSel
            item { DishSearch27(vm.b27.dishQ, { vm.b27.dishQ = it }, p) }
            val dishes = w.dishes.filter { (sel == null || it.folderId == sel) && dishHit27(it, vm.b27.dishQ) }
            item { MHead(if (sel == null) "Retter" else vm.matFolders.firstOrNull { it.id == sel }?.name ?: "Retter", "${dishes.size}", p) }
            if (dishes.isEmpty()) item { Text("Ingen retter i denne mappen ennå. Skann en oppskrift eller importer en lenke.", color = p.muted, fontSize = 14.sp, modifier = Modifier.padding(4.dp)) }
            items(dishes.size) { i ->
                val dish = dishes[i]
                Column {
                    Row(
                        Modifier.fillMaxWidth().clickable { vm.matDay = null; vm.dishOpen = dish.id }.padding(2.dp, 9.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Column(Modifier.weight(1f)) {
                            MSerif(dish.name, 18, p.text, maxLines = 1)
                            Text(listOfNotNull(
                                vm.matFolders.firstOrNull { it.id == dish.folderId }?.name?.takeIf { sel == null },
                                if (dish.ing.isNotEmpty()) "${dish.ing.size} ingredienser" else null, dish.time,
                                if (dish.src == "hellofresh") "HelloFresh" else null, if (dish.links.isNotEmpty()) "${dish.links.size} vedlegg" else null,
                            ).joinToString(" · "), color = p.muted, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Text("›", color = p.muted)
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(p.border))
                }
            }
            item { MHead("Handleliste", "${w.shopping.count { !it.done }} igjen", p) }
            if (w.shopping.isEmpty()) item { Text("Handlelisten er tom.", color = p.muted, fontSize = 14.sp, modifier = Modifier.padding(4.dp)) }
            items(w.shopping.size) { i ->
                val sh = w.shopping[i]
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable(role = Role.Checkbox) { vm.toggleShop(sh.id) }.padding(vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(Modifier.size(24.dp).clip(RoundedCornerShape(7.dp)).background(if (sh.done) p.lime else Color.Transparent)
                        .border(1.5.dp, if (sh.done) p.lime else p.muted, RoundedCornerShape(7.dp)), contentAlignment = Alignment.Center) {
                        if (sh.done) Text("✓", color = p.onLime, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                    Text(sh.text, color = if (sh.done) p.muted else p.text, textDecoration = if (sh.done) TextDecoration.LineThrough else null)
                }
            }
        }
    }
    if (vm.dishOpen != null) DishSheet(vm, p)
    vm.recipePreview?.let { RecipePreviewDialog(vm, it, p) }
}

@Composable
private fun MatHeader(vm: AppViewModel, p: MatPalette) {
    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f)) {
            MLabel(vm.week?.let { w -> "Uke ${w.week ?: ""} · ${ddmm(w.start)}–${ddmm(w.end)}" } ?: "Mat", p.muted)
            Text("Mat", color = p.text, fontFamily = PaperFonts.serif, fontSize = 52.sp, lineHeight = 52.sp)
            MealNote36(vm, p)
        }
        if (vm.topRowTitle(true) == null) Avatar(vm)
    }
}

/** Dagens rett: limegrønt kort med dag og tid, retten i stor fet skrift og hvem som lager middag. */
@Composable
private fun TodayCard(vm: AppViewModel, d: Day, dish: Dish?, p: MatPalette, onClick: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.lime).clickable(onClick = onClick).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("I DAG · ${longDay[dayIdx(d.date)].uppercase()}", color = p.onLime, fontWeight = FontWeight.ExtraBold, fontSize = 12.5.sp, modifier = Modifier.weight(1f))
            dish?.time?.let { Text(it, color = p.onLime, fontWeight = FontWeight.ExtraBold, fontSize = 12.5.sp) }
            Box(
                Modifier.padding(start = 8.dp).size(32.dp).clip(CircleShape).background(p.onLime.copy(alpha = .12f)).clickable(role = Role.Button) { vm.planDay(d.date) }
                    .semantics { contentDescription = "Foreslå en annen rett" },
                contentAlignment = Alignment.Center,
            ) { Text("✦", color = p.onLime, fontWeight = FontWeight.Bold) }
        }
        Text(d.name ?: "Ingen rett ennå", color = p.onLime, fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 34.sp, lineHeight = 34.sp, letterSpacing = (-1).sp)
        val tag = when {
            d.tag == "best" -> d.bestCook?.let { "★ ${owner(it)} beste" }
            d.tag == "hellofresh" || d.source == "hellofresh" -> "HelloFresh"
            else -> null
        }
        Text(listOfNotNull(d.cook?.let { "$it lager middag" } ?: "Ingen kokk ennå", tag).joinToString(" · "), color = p.onLime, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
    }
}

@Composable
private fun MatButton(text: String, p: MatPalette, modifier: Modifier = Modifier, outline: Boolean = false, accent: Boolean = false, onClick: () -> Unit) {
    val bg = when { accent -> p.accent; outline -> Color.Transparent; else -> p.black }
    val fg = when { accent -> Color(0xFF1A0C04); outline -> p.text; else -> p.onBlack }
    Box(
        modifier.height(48.dp).clip(RoundedCornerShape(14.dp)).background(bg).then(if (outline) Modifier.border(1.dp, p.border, RoundedCornerShape(14.dp)) else Modifier)
            .clickable(role = Role.Button, onClick = onClick).padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = fg, fontWeight = if (outline) FontWeight.SemiBold else FontWeight.Bold, fontSize = 14.sp, maxLines = 1) }
}

/** Mappene som piller: Alle, mappene og «+ Ny mappe». Hold inne på en mappe for å gi nytt navn eller slette. */
@Composable
private fun FolderChips(vm: AppViewModel, p: MatPalette) {
    var edit by remember { mutableStateOf<MatFolder?>(null) }
    var adding by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        FolderChip("Alle", vm.matFolderSel == null, p, null) { vm.matFolderSel = null }
        vm.matFolders.forEach { f ->
            FolderChip(if (f.count > 0) "${f.name} ${f.count}" else f.name, vm.matFolderSel == f.id, p, { edit = f }) { vm.matFolderSel = if (vm.matFolderSel == f.id) null else f.id }
        }
        FolderChip("+ Ny mappe", false, p, null) { adding = true }
    }
    if (adding) NameDialog("Ny mappe", "", "Lag mappe", { adding = false }) { vm.addMatFolder(it); adding = false }
    edit?.let { f ->
        NameDialog("Mappe", f.name, "Lagre", { edit = null }, onDelete = { vm.deleteMatFolder(f.id); edit = null }) { vm.renameMatFolder(f.id, it); edit = null }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FolderChip(n: String, on: Boolean, p: MatPalette, onLong: (() -> Unit)?, onClick: () -> Unit) {
    Box(
        Modifier.height(36.dp).clip(CircleShape).background(if (on) p.text else p.card).border(1.dp, if (on) p.text else p.border, CircleShape)
            .combinedClickable(onLongClick = onLong, onClick = onClick).padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) { Text(n, color = if (on) p.bg else p.text, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1) }
}

@Composable
private fun NameDialog(title: String, initial: String, ok: String, dismiss: () -> Unit, onDelete: (() -> Unit)? = null, save: (String) -> Unit) {
    var name by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text(title) },
        text = { OutlinedTextField(name, { name = it.take(40) }, singleLine = true, label = { Text("Navn") }) },
        confirmButton = { TextButton(onClick = { if (name.isNotBlank()) save(name) }) { Text(ok) } },
        dismissButton = {
            Row {
                if (onDelete != null) TextButton(onClick = onDelete) { Text("Slett mappen", color = C.red) }
                TextButton(onClick = dismiss) { Text("Avbryt") }
            }
        },
    )
}

/** «Importer fra nettside»: lim inn en adresse; serveren leser oppskriften (JSON-LD, microdata eller AI). */
@Composable
private fun ImportField(vm: AppViewModel, p: MatPalette, done: () -> Unit) {
    var url by remember { mutableStateOf("") }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        MLabel("Importer fra nettside", p.label)
        BasicTextField(
            url, { url = it }, singleLine = true,
            textStyle = TextStyle(color = p.text, fontSize = 14.sp),
            cursorBrush = SolidColor(p.accent),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { if (url.isNotBlank()) vm.importRecipe(url) }),
            modifier = Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp)).border(1.dp, p.border, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp),
            decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (url.isEmpty()) Text("https://www.matprat.no/oppskrifter/…", color = p.muted, fontSize = 14.sp); inner() } },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            MatButton(if (vm.recipeBusy) "Henter …" else "Hent oppskrift", p, Modifier.weight(1f)) { if (url.isNotBlank() && !vm.recipeBusy) vm.importRecipe(url) }
            MatButton("Lukk", p, outline = true, onClick = done)
        }
        Text("Navn, bilde, ingredienser og steg hentes fra siden. Du ser en forhåndsvisning før retten lagres.", color = p.muted, fontSize = 12.sp)
    }
}

/** Skannekøen for oppskrifter: «✦ Gemini leser …», ferdig eller feil (prøv igjen). */
@Composable
private fun RecipeJobs(vm: AppViewModel, p: MatPalette) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(14.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        MLabel("Skann oppskrift · ✦ Gemini leser i bakgrunnen", p.label)
        vm.recipeJobs.take(5).forEach { j ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                when {
                    j.active -> CircularProgressIndicator(Modifier.size(16.dp), color = p.accent, strokeWidth = 2.dp)
                    j.status == "error" -> Text("!", color = C.red, fontWeight = FontWeight.Bold)
                    else -> Text("✓", color = C.positive, fontWeight = FontWeight.Bold)
                }
                Column(Modifier.weight(1f)) {
                    Text(j.name ?: if (j.active) "Leser oppskriften …" else "Oppskrift", color = p.text, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    j.error?.let { Text(it, color = C.red, fontSize = 12.sp, maxLines = 2) }
                }
                when {
                    j.status == "error" -> Text("Prøv igjen", color = p.accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { vm.retryRecipeJob(j.id) })
                    j.status == "done" && j.dishId != null -> Text("Åpne ›", color = p.accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { vm.matDay = null; vm.dishOpen = j.dishId })
                    else -> {}
                }
                if (!j.active) Text("×", color = p.muted, fontSize = 16.sp, modifier = Modifier.clickable { vm.removeRecipeJob(j.id) }.padding(4.dp))
            }
        }
    }
}

@Composable
private fun RemoteImage(vm: AppViewModel, path: String?, modifier: Modifier) {
    var bmp by remember(path) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(path) { if (!path.isNullOrBlank() && path.startsWith("/")) bmp = vm.image(path) }
    bmp?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = modifier) }
}

/** Forhåndsvisning før lagring: bilde, tid, porsjoner, antall ingredienser og steg, og hvilken mappe retten skal i. */
@Composable
private fun RecipePreviewDialog(vm: AppViewModel, r: RecipePreview, p: MatPalette) {
    val sugg = vm.matFolders.firstOrNull { it.name.equals(r.folderSuggestion, true) }?.id
    var folder by remember(r) { mutableStateOf(sugg) }
    AlertDialog(
        onDismissRequest = { vm.recipePreview = null },
        title = { Text(r.name.ifBlank { "Oppskrift" }, fontFamily = PaperFonts.serif) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                RemoteImage(vm, r.image, Modifier.fillMaxWidth().height(160.dp).clip(RoundedCornerShape(14.dp)))
                Text(listOfNotNull(r.time, r.servings?.let { "$it porsjoner" }, "${r.ingredients.size} ingredienser", "${r.steps.size} steg").joinToString(" · "), color = C.text2, fontSize = 13.sp)
                r.method?.let { Text(when (it) { "jsonld" -> "Lest fra oppskriftsdata (JSON-LD)"; "microdata" -> "Lest fra microdata"; else -> "✦ Lest av AI" }, color = C.text2, fontSize = 12.sp) }
                if (r.ingredients.isNotEmpty()) Text(r.ingredients.take(6).joinToString("\n") + if (r.ingredients.size > 6) "\n…" else "", fontSize = 13.sp)
                MLabel("Mappe", p.label)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    (listOf<MatFolder?>(null) + vm.matFolders).forEach { f ->
                        FilterChip(selected = folder == f?.id, onClick = { folder = f?.id }, label = { Text(f?.name ?: "Ingen") })
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { vm.saveRecipe(folder) }, enabled = !vm.recipeBusy) { Text("Lagre retten") } },
        dismissButton = { TextButton(onClick = { vm.recipePreview = null }) { Text("Avbryt") } },
    )
}

/** Retten: oppskrift, «Original oppskrift ↗», mappe, lenker og filer, og dagens valg (kokk, fast, annen rett). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DishSheet(vm: AppViewModel, p: MatPalette) {
    val ctx = LocalContext.current
    val w = vm.week
    val dish = w?.dishes?.firstOrNull { it.id == vm.dishOpen }
    val day = vm.matDay?.let { w?.days?.getOrNull(it) }
    val file = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null && dish != null) vm.uploadDishFile(dish.id, uri) }
    var addLink by remember { mutableStateOf(false) }
    var lt by remember { mutableStateOf("") }
    var lu by remember { mutableStateOf("") }
    var pick by remember { mutableStateOf(false) }
    ModalBottomSheet(onDismissRequest = { vm.dishOpen = null }, containerColor = p.bg, contentColor = p.text) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(18.dp, 0.dp, 18.dp, 32.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            day?.let { MLabel("${longDay[dayIdx(it.date)]} ${ddmm(it.date)}", p.label) }
            MSerif(dish?.name ?: day?.name ?: "Ingen rett ennå", 30, p.text, maxLines = 3)
            dish?.image?.let { RemoteImage(vm, it, Modifier.fillMaxWidth().height(180.dp).clip(RoundedCornerShape(16.dp))) }
            Text(listOfNotNull(dish?.time, dish?.servings?.let { "$it porsjoner" }, if (dish?.src == "hellofresh") "HelloFresh" else null).joinToString(" · "), color = p.muted, fontSize = 13.sp)
            dish?.sourceUrl?.let { u -> Text("Original oppskrift ↗", color = p.accent, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { openLink(ctx, u) }) }
            if (day != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box {
                        MatButton("Kokk: ${day.cook ?: "velg"}", p, outline = true) { pick = true }
                        DropdownMenu(expanded = pick, onDismissRequest = { pick = false }) {
                            w?.cooks?.forEach { c -> DropdownMenuItem(text = { Text(c) }, onClick = { pick = false; vm.setCook(day.date, c) }) }
                        }
                    }
                    MatButton(if (day.fixed) "Fast ✓" else "Fast", p, outline = !day.fixed) { vm.toggleFixed(day) }
                    MatButton("✦ Annen rett", p, accent = true) { vm.planDay(day.date); vm.dishOpen = null }
                }
            }
            if (dish != null) {
                MLabel("Mappe", p.label)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    (listOf<MatFolder?>(null) + vm.matFolders).forEach { f ->
                        FilterChip(selected = dish.folderId == f?.id, onClick = { vm.setDishFolder(dish.id, f?.id) }, label = { Text(f?.name ?: "Ingen") })
                    }
                }
                val ing = dish.ing.ifEmpty { day?.ingredients ?: emptyList() }
                MHead("Ingredienser", "${ing.size}", p)
                if (ing.isEmpty()) Text("Ingen ingredienser lagt inn.", color = p.muted, fontSize = 14.sp)
                ing.forEach { Text("· $it", color = p.text, fontSize = 15.sp) }
                if (ing.isNotEmpty()) MatButton("Legg i handlelisten", p, Modifier.fillMaxWidth()) { vm.addToShop(ing) }
                if (dish.steps.isNotEmpty()) {
                    MHead("Slik gjør du", "${dish.steps.size} steg", p)
                    dish.steps.forEachIndexed { i, t ->
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            MSerif("${i + 1}", 18, p.accent)
                            Text(t, color = p.text, fontSize = 15.sp, modifier = Modifier.weight(1f))
                        }
                    }
                }
                MHead("Lenker og filer", "${dish.links.size}", p)
                dish.links.forEach { l ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.card)
                            .clickable { if (l.fileUrl != null) vm.openDishFile(l) else l.url?.let { openLink(ctx, it) } }.padding(12.dp, 10.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(Modifier.size(34.dp).clip(RoundedCornerShape(9.dp)).background(p.row), contentAlignment = Alignment.Center) {
                            Text(when (l.kind) { "sheet" -> "▦"; "pdf" -> "PDF"; "video" -> "▶"; "doc" -> "¶"; "image" -> "▣"; else -> "↗" }, color = p.text, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                        Column(Modifier.weight(1f)) {
                            Text(l.title, color = p.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(l.kindLabel, color = p.muted, fontSize = 12.sp)
                        }
                        Text("×", color = p.muted, fontSize = 16.sp, modifier = Modifier.clickable { vm.removeDishLink(dish.id, l.id) }.padding(4.dp))
                    }
                }
                if (addLink) {
                    OutlinedTextField(lt, { lt = it }, singleLine = true, label = { Text("Tittel") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(lu, { lu = it }, singleLine = true, label = { Text("Adresse") }, modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
                    MatButton("Lagre lenken", p, Modifier.fillMaxWidth()) { if (lu.isNotBlank()) { vm.addDishLink(dish.id, lt, lu); lt = ""; lu = ""; addLink = false } }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MatButton("+ Lenke", p, Modifier.weight(1f), outline = true) { addLink = !addLink }
                    MatButton("+ Fil", p, Modifier.weight(1f), outline = true) { file.launch(arrayOf("*/*")) }
                }
                Text("Regneark, PDF, Word, bilder og video. Filene lagres med retten på serveren.", color = p.muted, fontSize = 12.sp)
            } else if (day != null) {
                Text("Ingen rett denne dagen ennå. Trykk ✦ for et forslag.", color = p.muted, fontSize = 14.sp)
            }
        }
    }
}


private val MAT_SECS = listOf(PSec("m1", "Dagens middag"), PSec("m2", "Ukeplan"), PSec("m3", "Mapper"), PSec("m4", "Skann og import"), PSec("m5", "Handleliste"))

/** Ett av kortene på Mat-siden i Papir. */
@Composable
private fun MatPaperSec(vm: AppViewModel, w: Week, k: String, p: MatPalette, linkOpen: Boolean, setLink: (Boolean) -> Unit) {
    val todayIso = LocalDate.now().toString()
    val ti = w.days.indexOfFirst { it.today || it.date == todayIso }.coerceAtLeast(0)
    when (k) {
        "m1" -> {
            val today = w.days[ti]
            val todayDish = w.dishes.firstOrNull { it.id == today.dishId } ?: w.dishes.firstOrNull { it.name == today.name }
            TodayCard(vm, today, todayDish, p) { vm.matDay = ti; vm.dishOpen = todayDish?.id ?: "" }
        }
        "m2" -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            MHead("Uka", w.week?.let { "Uke $it" }, p)
            w.days.forEachIndexed { i, d ->
                val dish = w.dishes.firstOrNull { it.id == d.dishId } ?: w.dishes.firstOrNull { it.name == d.name }
                Row(
                    Modifier.fillMaxWidth().clickable { vm.matDay = i; vm.dishOpen = dish?.id ?: "" }.padding(2.dp, 8.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    MLabel(shortDay[dayIdx(d.date)], if (i == ti) p.accent else p.muted, Modifier.width(36.dp))
                    MSerif(d.name ?: "Ingen rett ennå", 18, if (d.name == null) p.muted else p.text, Modifier.weight(1f), maxLines = 1)
                    Text(listOfNotNull(d.cook, if (d.fixed) "fast" else null).joinToString(" · "), color = p.muted, fontSize = 12.sp, maxLines = 1)
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.border))
            }
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MatButton("✦ Ny plan for uka", p, Modifier.weight(1f), accent = true) { vm.planWeek() }
                MatButton("Hele uka", p, Modifier.weight(1f), outline = true) { vm.matFull = true }
            }
        }
        "m3" -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            FolderChips(vm, p)
            // Prompt 27: søk i retter og ingredienser med ✕ til venstre (fasit Matplan.dc.html).
            var dq by remember { mutableStateOf("") }
            DishSearch27(dq, { dq = it }, p)
            val sel = vm.matFolderSel
            val dishes = w.dishes.filter { (sel == null || it.folderId == sel) && dishHit27(it, dq) }
            MHead(if (sel == null) "Retter" else vm.matFolders.firstOrNull { it.id == sel }?.name ?: "Retter", "${dishes.size}", p)
            if (dishes.isEmpty()) Text("Ingen retter i denne mappen ennå. Skann en oppskrift eller importer en lenke.", color = p.muted, fontSize = 14.sp, modifier = Modifier.padding(4.dp))
            dishes.forEach { dish ->
                Row(
                    Modifier.fillMaxWidth().clickable { vm.matDay = null; vm.dishOpen = dish.id }.padding(2.dp, 9.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(Modifier.weight(1f)) {
                        MSerif(dish.name, 18, p.text, maxLines = 1)
                        Text(listOfNotNull(
                            vm.matFolders.firstOrNull { it.id == dish.folderId }?.name?.takeIf { sel == null },
                            if (dish.ing.isNotEmpty()) "${dish.ing.size} ingredienser" else null, dish.time,
                            if (dish.src == "hellofresh") "HelloFresh" else null, if (dish.links.isNotEmpty()) "${dish.links.size} vedlegg" else null,
                        ).joinToString(" · "), color = p.muted, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Text("›", color = p.muted)
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.border))
            }
        }
        "m4" -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MatButton("Skann oppskrift", p, Modifier.weight(1f)) { vm.scanTarget = "recipe"; vm.scanSheet = true }
                MatButton("Importer lenke", p, Modifier.weight(1f), outline = true) { setLink(!linkOpen) }
            }
            if (linkOpen || vm.recipeBusy) ImportField(vm, p) { setLink(false) }
            if (vm.recipeJobs.isNotEmpty()) RecipeJobs(vm, p)
        }
        "m5" -> Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            MHead("Handleliste", "${w.shopping.count { !it.done }} igjen", p)
            if (w.shopping.isEmpty()) Text("Handlelisten er tom.", color = p.muted, fontSize = 14.sp, modifier = Modifier.padding(4.dp))
            w.shopping.forEach { sh ->
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable(role = Role.Checkbox) { vm.toggleShop(sh.id) }.padding(vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(Modifier.size(24.dp).clip(RoundedCornerShape(7.dp)).background(if (sh.done) p.lime else Color.Transparent)
                        .border(1.5.dp, if (sh.done) p.lime else p.muted, RoundedCornerShape(7.dp)), contentAlignment = Alignment.Center) {
                        if (sh.done) Text("✓", color = p.onLime, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                    Text(sh.text, color = if (sh.done) p.muted else p.text, textDecoration = if (sh.done) TextDecoration.LineThrough else null)
                }
            }
        }
    }
}

/* Prompt 27: søk i retter og ingredienser (✕ til venstre, fokus beholdes). */
private fun dishHit27(d: Dish, q: String): Boolean {
    val t = q.trim()
    if (t.isEmpty()) return true
    val k = norm27(t)
    return norm27(d.name).contains(k) || d.ing.any { norm27(it).contains(k) } || score27(d.name, t) > 0
}

@Composable
private fun DishSearch27(q: String, set: (String) -> Unit, p: MatPalette) {
    SearchField27(
        q, set, "Søk i retter og ingredienser",
        Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(14.dp)).background(p.card).border(1.dp, p.border, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp),
        p.text, p.muted, fontSize = 15.sp, cursor = p.accent,
    )
}

/** «Felles for husstanden · Endret av Nina 18.42» (prompt 36). */
@Composable
private fun MealNote36(vm: AppViewModel, p: MatPalette) {
    Text(vm.p36.mealNote ?: "Felles for husstanden", color = p.muted, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
        modifier = Modifier.padding(start = 2.dp, top = 2.dp))
}

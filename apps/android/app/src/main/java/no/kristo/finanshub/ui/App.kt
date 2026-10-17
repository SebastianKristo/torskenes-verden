package no.kristo.finanshub.ui

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import no.kristo.finanshub.*
import java.io.File

private val icons: Map<Screen, ImageVector> = mapOf(
    Screen.Home to Icons.Filled.Home, Screen.List to Icons.AutoMirrored.Filled.List, Screen.Budget to Icons.Filled.PieChart,
    Screen.Scan to Icons.Filled.CloudUpload, Screen.Me to Icons.Filled.Person, Screen.Mat to Icons.Filled.Restaurant,
)

@Composable
fun FinansApp(vm: AppViewModel, width: WindowWidthSizeClass) {
    if (!vm.loggedIn) { LoginScreen(vm); return }
    val ctx = LocalContext.current
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(vm.message) { vm.message?.let { snack.showSnackbar(it); vm.message = null } }

    // Kamera (bakkamera via systemets kamera-app) og filvelger.
    var photoUri by remember { mutableStateOf<Uri?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) photoUri?.let(vm::uploadUri) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris -> vm.uploadUris(uris) }
    val scan: () -> Unit = {
        val dir = File(ctx.cacheDir, "scans").apply { mkdirs() }
        val f = File(dir, "kvittering-${System.currentTimeMillis()}.jpg")
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
        photoUri = uri
        camera.launch(uri)
    }
    val pick: () -> Unit = { picker.launch("*/*") }

    val twoPane = width != WindowWidthSizeClass.Compact
    Scaffold(
        containerColor = C.bg,
        snackbarHost = { SnackbarHost(snack) },
        bottomBar = {
            if (!twoPane) NavigationBar(containerColor = C.surface1) {
                listOf(Screen.Home, Screen.List, Screen.Budget, Screen.Mat).forEach { s ->
                    NavigationBarItem(selected = vm.screen == s, onClick = { vm.go(s) }, icon = { Icon(icons.getValue(s), null) }, label = { Text(s.label) })
                }
            }
        },
        floatingActionButton = {
            if (!twoPane && vm.screen != Screen.Scan && vm.screen != Screen.Mat && vm.selectedTx == null) ExtendedFloatingActionButton(
                onClick = { vm.go(Screen.Scan) }, containerColor = C.primary, contentColor = C.onPrimary, shape = RoundedCornerShape(20.dp),
                icon = { Icon(Icons.Filled.DocumentScanner, null) }, text = { Text("Last opp", fontWeight = FontWeight.Bold) },
            )
        },
    ) { pad ->
        Row(Modifier.fillMaxSize().padding(pad)) {
            if (twoPane) NavigationRail(containerColor = C.surface1, header = {
                FloatingActionButton(onClick = { vm.go(Screen.Scan) }, containerColor = C.primary, contentColor = C.onPrimary, shape = RoundedCornerShape(16.dp)) { Icon(Icons.Filled.DocumentScanner, "Last opp") }
            }) {
                Spacer(Modifier.height(8.dp))
                Screen.entries.forEach { s ->
                    NavigationRailItem(selected = vm.screen == s, onClick = { vm.go(s) }, icon = { Icon(icons.getValue(s), null) }, label = { Text(s.label) })
                }
            }
            // Liste til venstre, detaljer til høyre når skjermen er bred (åpen brettbar).
            Box(Modifier.weight(1f).fillMaxHeight()) { MainPane(vm, twoPane, scan, pick) }
            if (twoPane) Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(topStart = 28.dp, bottomStart = 28.dp)).background(Color(0xFF1E1712))) { DetailPane(vm) }
        }
        if (vm.busy) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) }
    }
    if (vm.menuOpen) ProfileMenu(vm)
}

@Composable
private fun MainPane(vm: AppViewModel, twoPane: Boolean, scan: () -> Unit, pick: () -> Unit) {
    when (vm.screen) {
        Screen.Home, Screen.List -> if (!twoPane && vm.selectedTx != null) {
            BackHandler { vm.selectedTx = null }
            TxDetail(vm, back = { vm.selectedTx = null })
        } else if (vm.screen == Screen.Home) HomeScreen(vm) else ListScreen(vm, twoPane)
        Screen.Mat -> MatScreen(vm)
        Screen.Budget -> BudgetScreen(vm)
        Screen.Scan -> if (!twoPane && vm.selectedReceipt != null) ReceiptConfirm(vm, back = { vm.selectedReceipt = null }) else ScanQueue(vm, scan, pick)
        Screen.Me -> MeScreen(vm)
    }
}

@Composable
private fun DetailPane(vm: AppViewModel) {
    when (vm.screen) {
        Screen.Scan -> if (vm.selectedReceipt != null) ReceiptConfirm(vm, back = null) else Empty("Velg en kvittering.")
        Screen.Budget -> BudgetDetail(vm)
        Screen.Me -> Column(Modifier.padding(20.dp)) { Hero(vm) }
        Screen.Mat -> ShoppingPane(vm)
        else -> TxDetail(vm, back = null)
    }
}

/* ---------------- Felles ---------------- */

@Composable
private fun Page(content: LazyListScopeContent) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 12.dp, 16.dp, 120.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
}
private typealias LazyListScopeContent = androidx.compose.foundation.lazy.LazyListScope.() -> Unit

@Composable
private fun Empty(text: String) = Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { Text(text, color = C.text2) }

@Composable
private fun SectionLabel(text: String) = Text(text, color = C.primary, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 8.dp, top = 8.dp))

@Composable
private fun Initial(text: String, color: Long, size: Int = 40, shape: RoundedCornerShape = CircleShape) {
    val c = Color(color)
    Box(Modifier.size(size.dp).clip(shape).background(c.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
        Text(initial(text), color = c, fontWeight = FontWeight.Bold)
    }
}

/** Butikklogo (favicon via serverens cache) på hvit flate; initial når domenet er ukjent. */
@Composable
private fun Logo(vm: AppViewModel, domain: String?, name: String, color: Long, size: Int = 40, shape: RoundedCornerShape = RoundedCornerShape((size / 4).dp)) {
    var bmp by remember(domain) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(domain) { bmp = vm.logo(domain) }
    val b = bmp
    if (b == null) Initial(name, color, size, shape)
    else Box(Modifier.size(size.dp).clip(shape).background(Color.White).padding((size / 9).dp), contentAlignment = Alignment.Center) {
        Image(b.asImageBitmap(), null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
    }
}

@Composable
private fun AiLine(text: String?) {
    if (!text.isNullOrBlank()) Text("✦ $text", color = C.accentLight, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

/** Liste-elementer i M3 Expressive: første og siste har stor runding, de i midten liten. */
private fun itemShape(i: Int, n: Int) = when {
    n == 1 -> RoundedCornerShape(24.dp)
    i == 0 -> RoundedCornerShape(24.dp, 24.dp, 6.dp, 6.dp)
    i == n - 1 -> RoundedCornerShape(6.dp, 6.dp, 24.dp, 24.dp)
    else -> RoundedCornerShape(6.dp)
}

@Composable
private fun TxRow(vm: AppViewModel, t: Tx, shape: RoundedCornerShape, selected: Boolean = false, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(shape).background(if (selected) C.surface3 else C.surface1).clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Logo(vm, t.domain, t.description, t.color)
        Column(Modifier.weight(1f)) {
            Text(t.description, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${ddmm(t.date)} · ${t.category}", color = C.text2, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            AiLine(t.aiShort)
        }
        Text(signed(t.amount), fontFamily = Mono, fontWeight = FontWeight.SemiBold, color = if (t.amount > 0) C.positive else C.text)
    }
}

@Composable
private fun TxGroup(list: List<Tx>, vm: AppViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        list.forEachIndexed { i, t -> TxRow(vm, t, itemShape(i, list.size), vm.selectedTx == t.id) { vm.selectedTx = t.id } }
    }
}

@Composable
private fun Hero(vm: AppViewModel) {
    val s = vm.summary ?: return Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) }
    val pct = if (s.budgetTotal > 0) (s.budgetUsed / s.budgetTotal).toFloat().coerceIn(0f, 1f) else 0f
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(32.dp, 32.dp, 32.dp, 8.dp)).background(C.primary).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Igjen å bruke", color = C.onPrimary, fontWeight = FontWeight.SemiBold)
        Row(verticalAlignment = Alignment.Bottom) {
            Text(neg0(s.left), color = C.onPrimary, fontFamily = Mono, fontSize = 44.sp, fontWeight = FontWeight.SemiBold)
            Text(" kr", color = C.onPrimary.copy(alpha = .7f), fontSize = 18.sp, modifier = Modifier.padding(bottom = 8.dp))
        }
        LinearProgressIndicator(progress = { pct }, Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)), color = C.onPrimary, trackColor = C.onPrimary.copy(alpha = .18f))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Brukt ${n0(s.budgetUsed)} kr", color = C.onPrimary, fontWeight = FontWeight.Medium)
            Text("${n0(maxOf(0.0, s.left) / maxOf(1, s.daysLeft))} kr/dag", color = C.onPrimary, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
private fun ReviewCta(vm: AppViewModel) {
    val q = vm.summary?.review?.filter { it.status == "needs_review" } ?: return
    if (q.isEmpty()) return
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(C.container).clickable { vm.go(Screen.Scan) }.padding(16.dp, 16.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(C.primary), contentAlignment = Alignment.Center) { Text("${q.size}", color = C.onPrimary, fontWeight = FontWeight.ExtraBold) }
        Column(Modifier.weight(1f)) {
            Text("Til gjennomgang", color = C.onContainer, fontWeight = FontWeight.SemiBold)
            Text(q.joinToString(" · ") { it.merchant ?: "Ny" }, color = C.onContainer.copy(alpha = .8f), fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Icon(Icons.Filled.ChevronRight, null, tint = C.onContainer)
    }
}

/* ---------------- Skjermer ---------------- */

@Composable
private fun HomeScreen(vm: AppViewModel) {
    val s = vm.summary
    val name = vm.boot?.settings?.name ?: ""
    Page {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Text("Hei, $name", color = C.text2, fontSize = 16.sp)
                    Text(monthLabel(s?.month ?: ""), style = MaterialTheme.typography.displaySmall)
                }
                IconButton(onClick = { vm.refresh() }) { Icon(Icons.Filled.Refresh, "Oppdater", tint = C.text2) }
                Box(Modifier.size(44.dp).clip(CircleShape).background(C.container).clickable { vm.menuOpen = true }, contentAlignment = Alignment.Center) { Text(initial(name), color = C.onContainer, fontWeight = FontWeight.SemiBold) }
            }
        }
        item { Hero(vm) }
        if (s != null) item {
            Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                InnCard(s, Modifier.weight(1f).fillMaxHeight())
                SavedCard(s, Modifier.weight(1f).fillMaxHeight())
            }
        }
        item { UploadPill(vm) }
        item { ReviewCta(vm) }
        item { SectionLabel("Siste") }
        item { s?.recent?.take(6)?.let { TxGroup(it, vm) } ?: Empty("Laster …") }
    }
}

/** «Inn i oktober»: pil-badge og sju mini-stolper der siste (denne måneden) er grønn. */
@Composable
private fun InnCard(s: Summary, modifier: Modifier) {
    val bars = (s.innMonthly.ifEmpty { listOf(s.inn) }).takeLast(7)
    val max = maxOf(1.0, bars.maxOrNull() ?: 1.0)
    Column(modifier.clip(RoundedCornerShape(28.dp, 10.dp, 28.dp, 28.dp)).background(C.surface2).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Inn i ${monthLabel(s.month).lowercase()}", color = C.text2, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Box(Modifier.size(24.dp).clip(CircleShape).background(C.positiveBg), contentAlignment = Alignment.Center) { Icon(Icons.Filled.SouthWest, null, tint = C.positive, modifier = Modifier.size(14.dp)) }
        }
        Text(n0(s.inn), fontFamily = Mono, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Row(Modifier.fillMaxWidth().height(28.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.Bottom) {
            bars.forEachIndexed { i, v ->
                Box(Modifier.weight(1f).fillMaxHeight((v / max).toFloat().coerceIn(0.08f, 1f)).clip(RoundedCornerShape(3.dp))
                    .background(if (i == bars.lastIndex) C.positive else C.surface3))
            }
        }
    }
}

/** «Spart i år»: konisk ring (58 px) mot årsmålet. */
@Composable
private fun SavedCard(s: Summary, modifier: Modifier) {
    val pct = if (s.yearGoal > 0) (s.savedYear / s.yearGoal).toFloat().coerceIn(0f, 1f) else 0f
    Column(modifier.clip(RoundedCornerShape(10.dp, 28.dp, 28.dp, 28.dp)).background(C.surface3).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Spart i år", color = C.text2, fontSize = 13.sp)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(58.dp), contentAlignment = Alignment.Center) {
                Canvas(Modifier.fillMaxSize()) {
                    val w = 8.dp.toPx()
                    val tl = Offset(w / 2, w / 2); val sz = Size(size.width - w, size.height - w)
                    drawArc(C.surface1, 0f, 360f, false, tl, sz, style = Stroke(w))
                    drawArc(C.primary, -90f, 360f * pct, false, tl, sz, style = Stroke(w, cap = StrokeCap.Round))
                }
                Text("${(pct * 100).toInt()}%", fontFamily = Mono, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
            Column {
                Text(n0(s.savedYear), fontFamily = Mono, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                if (s.yearGoal > 0) Text("av ${n0(s.yearGoal)}", color = C.text2, fontSize = 12.sp)
            }
        }
        if (s.yearGoal > 0) Text("${n0(maxOf(0.0, s.yearGoal - s.savedYear))} kr igjen", color = C.text2, fontSize = 12.sp)
    }
}

/** Pille på forsiden som viser fremdrift i opplastingskøen. */
@Composable
private fun UploadPill(vm: AppViewModel) {
    val active = vm.jobs.filter { it.status == "pending" || it.status == "processing" }
    val ready = vm.jobs.count { it.status == "needs_review" }
    if (active.isEmpty() && vm.uploading == 0 && ready == 0) return
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(C.surface2).clickable { vm.go(Screen.Scan) }.padding(16.dp, 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (active.isNotEmpty() || vm.uploading > 0) CircularProgressIndicator(color = C.primary, strokeWidth = 3.dp, modifier = Modifier.size(22.dp))
        else Icon(Icons.Filled.CheckCircle, null, tint = C.positive)
        Text(
            when {
                vm.uploading > 0 -> "Laster opp ${vm.uploading} fil${if (vm.uploading > 1) "er" else ""} …"
                active.isNotEmpty() -> "Gemini leser ${active.size} kvittering${if (active.size > 1) "er" else ""} · ${active.map { it.progress }.average().toInt()} %"
                else -> "$ready klar · trykk for å bekrefte"
            }, Modifier.weight(1f), fontWeight = FontWeight.Medium,
        )
        Icon(Icons.Filled.ChevronRight, null, tint = C.text2)
    }
}

@Composable
private fun Tile(label: String, value: String, shape: RoundedCornerShape, bg: Color, modifier: Modifier) {
    Column(modifier.clip(shape).background(bg).padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, color = C.text2, fontSize = 13.sp)
        Text(value, fontFamily = Mono, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ListScreen(vm: AppViewModel, twoPane: Boolean) {
    val txs = vm.txs
    Page {
        item { Text("Transaksjoner", style = MaterialTheme.typography.displaySmall, modifier = Modifier.padding(top = 8.dp)) }
        item {
            TextField(
                value = vm.query, onValueChange = { vm.query = it }, placeholder = { Text("Søk i transaksjoner") },
                leadingIcon = { Icon(Icons.Filled.Search, null) }, singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { vm.search() }),
                shape = RoundedCornerShape(28.dp), modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
                colors = TextFieldDefaults.colors(focusedContainerColor = C.surface2, unfocusedContainerColor = C.surface2, focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent),
            )
        }
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("" to "Alle", "ut" to "Utgifter", "inn" to "Inntekter").forEach { (k, n) ->
                    val on = vm.filter == k
                    FilterChip(selected = on, onClick = { vm.filter = k; vm.search() }, label = { Text(n) },
                        shape = RoundedCornerShape(if (on) 18.dp else 10.dp),
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = C.container, selectedLabelColor = C.onContainer))
                }
            }
        }
        if (txs == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) } }
        else if (txs.isEmpty()) item { Empty("Ingen treff.") }
        else txs.groupBy { it.date }.forEach { (date, list) ->
            item(key = date) {
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    SectionLabel(dayLabel(date))
                    TxGroup(list, vm)
                }
            }
        }
    }
}

@Composable
private fun BudgetScreen(vm: AppViewModel) {
    val list = vm.summary?.budgets?.filter { it.budget > 0 }?.sortedByDescending { it.used / it.budget } ?: emptyList()
    Page {
        item { Text("Budsjett", style = MaterialTheme.typography.displaySmall, modifier = Modifier.padding(top = 8.dp)) }
        vm.summary?.let { s ->
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Tile("Budsjett", n0(s.budgetTotal), RoundedCornerShape(24.dp, 8.dp, 8.dp, 24.dp), C.surface2, Modifier.weight(1f))
                    Tile("Brukt", n0(s.budgetUsed), RoundedCornerShape(8.dp), C.surface2, Modifier.weight(1f))
                    Tile("Dager igjen", "${s.daysLeft}", RoundedCornerShape(8.dp, 24.dp, 24.dp, 8.dp), C.surface2, Modifier.weight(1f))
                }
            }
        }
        if (list.isEmpty()) item { Empty("Ingen budsjett satt. Sett opp i FinansHub på nettet.") }
        items(list, key = { it.categoryId }) { b ->
            val over = b.used > b.budget
            val days = maxOf(1, vm.summary?.daysLeft ?: 1)
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(if (vm.selectedBudget == b.categoryId) C.surface3 else C.surface1)
                    .clickable { vm.selectedBudget = b.categoryId }.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(b.category, fontWeight = FontWeight.SemiBold)
                    Text("${n0(b.used)} / ${n0(b.budget)}", fontFamily = Mono, color = if (over) C.primary else C.text2, fontSize = 14.sp)
                }
                LinearProgressIndicator(progress = { (b.used / b.budget).toFloat().coerceIn(0f, 1f) }, Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),
                    color = if (over) C.accent else Color(b.color), trackColor = C.surface2)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(if (over) "Over med ${n0(b.used - b.budget)} kr" else "${n0(b.budget - b.used)} kr igjen · ${n0((b.budget - b.used) / days)} kr/dag",
                        color = if (over) C.primary else C.text2, fontSize = 13.sp)
                    Text("${(b.used / b.budget * 100).toInt()} % brukt", color = C.text2, fontSize = 13.sp)
                }
                val chips = buildList {
                    if (b.count > 0) add("${b.count} kjøp")
                    b.topMerchant?.let { add("Mest: $it") }
                    b.prevUsed?.takeIf { it > 0 }?.let { p -> val d = ((b.used - p) / p * 100).toInt(); add((if (d > 0) "↑ $d" else "↓ ${-d}") + " % mot forrige mnd") }
                }
                if (chips.isNotEmpty()) Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    chips.forEach { Text(it, fontSize = 12.sp, color = C.text2, modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(C.surface2).padding(8.dp, 4.dp)) }
                }
            }
        }
    }
}

@Composable
private fun BudgetDetail(vm: AppViewModel) {
    val s = vm.summary ?: return
    val b = s.budgets.firstOrNull { it.categoryId == vm.selectedBudget } ?: s.budgets.firstOrNull { it.budget > 0 } ?: return Empty("Velg en kategori.")
    val items = vm.txs?.filter { it.categoryId == b.categoryId && it.date >= s.from && it.date < s.to } ?: emptyList()
    val over = b.used > b.budget
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(b.category, style = MaterialTheme.typography.headlineMedium)
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(C.surface2).padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Brukt av ${n0(b.budget)} kr", color = C.text2)
            Text("${n0(b.used)} kr", fontFamily = Mono, fontSize = 36.sp, fontWeight = FontWeight.SemiBold)
            LinearProgressIndicator(progress = { (b.used / maxOf(1.0, b.budget)).toFloat().coerceIn(0f, 1f) }, Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)), color = if (over) C.accent else Color(b.color), trackColor = C.surface1)
            Text(if (over) "Over budsjett med ${n0(b.used - b.budget)} kr." else "${n0(b.budget - b.used)} kr igjen denne måneden.", color = C.text2)
        }
        if (items.isNotEmpty()) { SectionLabel("Transaksjoner"); TxGroup(items, vm) }
    }
}

@Composable
private fun TxDetail(vm: AppViewModel, back: (() -> Unit)?) {
    val pool = (vm.txs ?: emptyList()) + (vm.summary?.recent ?: emptyList())
    val t = pool.firstOrNull { it.id == vm.selectedTx } ?: pool.firstOrNull() ?: return Empty("Ingen transaksjon valgt.")
    val cats = vm.boot?.categories ?: emptyList()
    var open by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (back != null) FilledTonalIconButton(onClick = back, modifier = Modifier.size(48.dp)) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Tilbake") }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Logo(vm, t.domain, t.description, t.color, 60, RoundedCornerShape(18.dp))
            Column { Text(t.description, style = MaterialTheme.typography.titleLarge); Text(dayLabel(t.date), color = C.text2) }
        }
        Row(verticalAlignment = Alignment.Bottom) {
            Text(signed(t.amount), fontFamily = Mono, fontSize = 40.sp, fontWeight = FontWeight.SemiBold, color = if (t.amount > 0) C.positive else C.text)
            Text(" kr", color = C.text2, fontSize = 18.sp, modifier = Modifier.padding(bottom = 8.dp))
        }
        (t.aiLong ?: t.aiShort)?.let { txt ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp, 28.dp, 28.dp, 10.dp)).background(Color(0xFF763300)).padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("✦ AI-beskrivelse", color = Color(0xFFFFDBC8), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                Text(txt, color = Color(0xFFFFDBC8))
            }
        }
        if (t.lines.isNotEmpty()) {
            SectionLabel("Varelinjer")
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(C.surface1).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                t.lines.forEach { (d, a) -> Row(Modifier.fillMaxWidth()) { Text(d, Modifier.weight(1f), maxLines = 2); Text(n2(a), fontFamily = Mono) } }
            }
        }
        listOf("Kategori" to t.category, "Konto" to t.account, "Kvittering" to when (t.receipt) { "booked" -> "Vedlagt"; null -> "–"; else -> "Til gjennomgang" })
            .plus(listOf("Delt mappe" to (t.folder ?: "–")))
            .plus(if (t.note.isNotBlank()) listOf("Notat" to t.note) else emptyList())
            .forEach { (k, v) ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(C.surface1).padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(k, color = C.text2); Text(v, fontWeight = FontWeight.Medium)
                }
            }
        Box {
            OutlinedButton(onClick = { open = true }, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) { Text("Endre kategori") }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                cats.forEach { c -> DropdownMenuItem(text = { Text(c.name) }, onClick = { open = false; vm.setTxCategory(t.id, c.id) }) }
            }
        }
    }
}

@Composable
private fun ScanQueue(vm: AppViewModel, scan: () -> Unit, pick: () -> Unit) {
    val q = vm.receipts
    Page {
        item { Text("Last opp", style = MaterialTheme.typography.displaySmall, modifier = Modifier.padding(top = 8.dp)) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = scan, modifier = Modifier.weight(2f).height(64.dp), shape = RoundedCornerShape(28.dp, 8.dp, 8.dp, 28.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) {
                    Icon(Icons.Filled.PhotoCamera, null); Spacer(Modifier.width(8.dp)); Text("Ta bilde", fontWeight = FontWeight.Bold)
                }
                OutlinedButton(onClick = pick, modifier = Modifier.weight(1f).height(64.dp), shape = RoundedCornerShape(8.dp, 28.dp, 28.dp, 8.dp)) { Text("Velg filer") }
            }
        }
        val jobs = vm.jobs.filter { it.status != "booked" }
        if (jobs.isNotEmpty() || vm.uploading > 0) {
            item { SectionLabel("Kø") }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    val n = jobs.size + if (vm.uploading > 0) 1 else 0
                    if (vm.uploading > 0) JobRow("Laster opp ${vm.uploading} fil${if (vm.uploading > 1) "er" else ""}", "Sender til serveren …", null, itemShape(0, n)) {}
                    jobs.forEachIndexed { i, j ->
                        val idx = i + if (vm.uploading > 0) 1 else 0
                        val (title, sub) = when (j.status) {
                            "pending" -> j.name to "I kø"
                            "processing" -> j.name to "Gemini leser … ${j.progress} %"
                            "needs_review" -> (j.merchant ?: j.name) to "Klar · trykk for å bekrefte"
                            "error" -> j.name to "Feilet – fyll ut manuelt"
                            else -> j.name to j.status
                        }
                        JobRow(title, sub, j.progress.takeIf { j.status == "processing" }, itemShape(idx, n)) { vm.selectedReceipt = j.id }
                    }
                }
            }
        }
        when {
            q == null -> item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) } }
            q.isEmpty() -> item { Empty("Ingen kvitteringer i køen.") }
            else -> {
                item { SectionLabel("Til gjennomgang") }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        q.forEachIndexed { i, r ->
                            Row(
                                Modifier.fillMaxWidth().clip(itemShape(i, q.size)).background(if (vm.selectedReceipt == r.id) C.surface3 else C.surface1)
                                    .clickable { vm.selectedReceipt = r.id }.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
                            ) {
                                Thumb(vm, r.thumb)
                                Column(Modifier.weight(1f)) {
                                    Text(r.merchant ?: "Ny kvittering", fontWeight = FontWeight.Medium)
                                    Text(if (r.status == "needs_review") "${ddmm(r.date)} · ${r.provider ?: "manuell"}" else "Leser …", color = C.text2, fontSize = 13.sp)
                                }
                                r.total?.let { Text(n2(it), fontFamily = Mono) }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun JobRow(title: String, sub: String, progress: Int?, shape: RoundedCornerShape, onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(shape).background(C.surface1).clickable(onClick = onClick).padding(16.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(sub, color = if (sub.startsWith("Klar")) C.positive else C.text2, fontSize = 13.sp)
        if (progress != null) LinearProgressIndicator(progress = { progress / 100f }, Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)), color = C.primary, trackColor = C.surface2)
    }
}

@Composable
private fun Thumb(vm: AppViewModel, path: String?) {
    var bmp by remember(path) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(path) { if (path != null) bmp = vm.image(path) }
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(C.paper)) {
        bmp?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReceiptConfirm(vm: AppViewModel, back: (() -> Unit)?) {
    val all = vm.receipts ?: return
    val r = all.firstOrNull { it.id == vm.selectedReceipt } ?: return Empty("Velg en kvittering.")
    val queue = all.filter { it.status == "needs_review" }
    val st = vm.boot?.settings
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp, 12.dp, 16.dp, 40.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (back != null) FilledTonalIconButton(onClick = back, modifier = Modifier.size(48.dp)) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Tilbake") }
            Text("Bekreft kvittering", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            val idx = queue.indexOfFirst { it.id == r.id }
            if (idx >= 0) Text("${idx + 1} av ${queue.size}", color = C.text2)
        }
        if (r.status != "needs_review") {
            Column(Modifier.fillMaxWidth().padding(40.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                CircularProgressIndicator(color = C.primary); Text("Leser kvitteringen med ${if (st?.provider == "gemini") "Gemini" else "Ollama"} …", color = C.text2)
            }
            return@Column
        }
        ReceiptImage(vm, r)
        val high = r.error == null && r.flag == null && r.confidence >= (st?.minConf ?: 85) / 100.0
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(r.provider?.let { p -> "$p${r.seconds?.let { " · ${n2(it)} s" } ?: ""}" } ?: "Manuell utfylling", color = C.text2, fontSize = 13.sp)
            Text(if (r.error != null) "Fyll ut" else if (high) "Høy sikkerhet" else "Sjekk beløp", color = if (high) C.positive else C.primary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }
        r.error?.let { Text(it, color = C.primary, fontSize = 13.sp) }
        EditField("Butikk", r.merchant ?: "", key = r.id) { vm.updateReceipt(r.id, "merchant", it) }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            EditField("Dato (ÅÅÅÅ-MM-DD)", r.date ?: "", key = r.id, modifier = Modifier.weight(1f)) { vm.updateReceipt(r.id, "date", it) }
            EditField("Total", r.total?.let { n2(it).replace(" ", "") } ?: "", key = r.id, number = true, modifier = Modifier.weight(1f)) {
                vm.updateReceipt(r.id, "total", it.replace(" ", "").replace(',', '.').toDoubleOrNull())
            }
        }
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            vm.boot?.accounts?.forEach { a ->
                FilterChip(selected = r.accountId == a.id, onClick = { vm.updateReceipt(r.id, "accountId", a.id) }, label = { Text(a.name) })
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            vm.boot?.categories?.filter { it.kind == "expense" }?.forEach { c ->
                val on = r.categoryId == c.id
                FilterChip(selected = on, onClick = { vm.updateReceipt(r.id, "categoryId", c.id) }, label = { Text(c.name) }, shape = RoundedCornerShape(if (on) 18.dp else 10.dp),
                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = C.container, selectedLabelColor = C.onContainer))
            }
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(if (r.match != null) C.positiveBg else C.surface2).padding(16.dp, 14.dp)) {
            Text(if (r.match != null) "Matchet mot kortkjøp" else "Ingen bankmatch", fontWeight = FontWeight.SemiBold, color = if (r.match != null) C.positive else C.text)
            Text(r.match?.let { "${ddmm(it.date)} · ${signed(it.amount)} kr · ${it.account}" } ?: "Bokføres som ny transaksjon", color = C.text2, fontSize = 14.sp)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { vm.reject(r.id) }, modifier = Modifier.weight(1f).height(56.dp), shape = RoundedCornerShape(28.dp, 8.dp, 8.dp, 28.dp)) { Text("Avvis") }
            Button(onClick = { vm.book(r.id) }, modifier = Modifier.weight(2f).height(56.dp), shape = RoundedCornerShape(8.dp, 28.dp, 28.dp, 8.dp),
                colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text("Bokfør", fontWeight = FontWeight.Bold) }
        }
    }
}

@Composable
private fun ReceiptImage(vm: AppViewModel, r: Receipt) {
    var bmp by remember(r.id) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(r.id) { if (r.file != null && r.mime?.startsWith("image/") == true) bmp = vm.image(r.file) }
    val b = bmp
    if (b != null) Image(b.asImageBitmap(), "Kvittering", contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth().heightIn(max = 380.dp).clip(RoundedCornerShape(28.dp, 28.dp, 8.dp, 28.dp)).background(Color.Black))
    else Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp, 28.dp, 8.dp, 28.dp)).background(C.paper).padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text((r.merchant ?: "").uppercase(), color = Color(0xFF3A362E), fontFamily = Mono, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.CenterHorizontally))
        r.lines.forEach { (d, a) -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(d, color = Color(0xFF3A362E), fontFamily = Mono, fontSize = 12.sp, modifier = Modifier.weight(1f)); Text(n2(a), color = Color(0xFF3A362E), fontFamily = Mono, fontSize = 12.sp) } }
        HorizontalDivider(color = Color(0xFFB9B4A8))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("TOTAL", color = Color(0xFF3A362E), fontFamily = Mono, fontWeight = FontWeight.Bold); Text(r.total?.let(::n2) ?: "–", color = Color(0xFF3A362E), fontFamily = Mono, fontWeight = FontWeight.Bold) }
    }
}

/** Felt som lagres når man trykker ferdig på tastaturet eller forlater feltet. */
@Composable
private fun EditField(label: String, value: String, key: Any, number: Boolean = false, modifier: Modifier = Modifier.fillMaxWidth(), onSave: (String) -> Unit) {
    var text by remember(key, value) { mutableStateOf(value) }
    TextField(
        value = text, onValueChange = { text = it }, label = { Text(label) }, singleLine = true, modifier = modifier,
        textStyle = if (number) LocalTextStyle.current.copy(fontFamily = Mono) else LocalTextStyle.current,
        keyboardOptions = KeyboardOptions(keyboardType = if (number) KeyboardType.Decimal else KeyboardType.Text, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { if (text != value) onSave(text) }),
        shape = RoundedCornerShape(16.dp, 16.dp, 4.dp, 4.dp),
        colors = TextFieldDefaults.colors(focusedContainerColor = C.surface2, unfocusedContainerColor = C.surface2, focusedIndicatorColor = C.primary, focusedLabelColor = C.primary),
    )
    // Lagre også når feltet mister fokus med endringer.
    DisposableEffect(key) { onDispose { if (text != value) onSave(text) } }
}

@Composable
private fun MeScreen(vm: AppViewModel) {
    val st = vm.boot?.settings ?: return
    Page {
        item {
            Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(Modifier.size(56.dp).clip(CircleShape).background(C.container), contentAlignment = Alignment.Center) { Text(initial(st.name), color = C.onContainer, fontSize = 22.sp, fontWeight = FontWeight.SemiBold) }
                Column { Text(st.name, style = MaterialTheme.typography.headlineMedium); Text(vm.server.removePrefix("https://").removePrefix("http://"), color = C.text2, fontSize = 14.sp) }
            }
        }
        item { SectionLabel("AI-motor") }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                listOf("ollama" to "Ollama · lokalt", "gemini" to "Gemini · sky").forEachIndexed { i, (k, n) ->
                    Row(Modifier.fillMaxWidth().clip(itemShape(i, 3)).background(C.surface1).clickable { vm.saveSetting("provider", k) }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(n, Modifier.weight(1f)); RadioButton(selected = st.provider == k, onClick = { vm.saveSetting("provider", k) })
                    }
                }
                SwitchRow("Bruk reserve ved feil", st.fallback, itemShape(2, 3)) { vm.saveSetting("fallback", it) }
            }
        }
        item { SectionLabel("Varsler og regler") }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                SwitchRow("Budsjett 80 %", st.n80, itemShape(0, 4)) { vm.saveSetting("n80", it) }
                SwitchRow("Budsjett brukt opp", st.n100, itemShape(1, 4)) { vm.saveSetting("n100", it) }
                SwitchRow("Ny kvittering", st.nRc, itemShape(2, 4)) { vm.saveSetting("nRc", it) }
                SwitchRow("Auto-kategorisering", st.autoCat, itemShape(3, 4)) { vm.saveSetting("autoCat", it) }
            }
        }
        item {
            OutlinedButton(onClick = { vm.logout() }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp)) { Text("Logg ut", color = C.primary) }
        }
        item { Text("Flere innstillinger finnes i FinansHub på nettet.", color = C.text2, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().padding(8.dp)) }
    }
}

@Composable
private fun SwitchRow(label: String, on: Boolean, shape: RoundedCornerShape, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clip(shape).background(C.surface1).clickable { onChange(!on) }.padding(16.dp, 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        Switch(checked = on, onCheckedChange = onChange, colors = SwitchDefaults.colors(checkedTrackColor = C.primary, checkedThumbColor = C.onPrimary))
    }
}

/* ---------------- Innlogging ---------------- */

@Composable
private fun LoginScreen(vm: AppViewModel) {
    var server by remember { mutableStateOf(vm.server) }
    var pw by remember { mutableStateOf("") }
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(vm.message) { vm.message?.let { snack.showSnackbar(it); vm.message = null } }
    Scaffold(containerColor = C.bg, snackbarHost = { SnackbarHost(snack) }) { pad ->
        Column(Modifier.fillMaxSize().padding(pad).padding(24.dp).widthIn(max = 480.dp), verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically)) {
            Box(Modifier.size(56.dp).clip(RoundedCornerShape(18.dp)).background(C.accent), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Savings, null, tint = Color(0xFF1A0C04)) }
            Text("FinansHub", style = MaterialTheme.typography.displaySmall)
            Text("Logg inn på homelab-serveren din. Appen får bare tilgang til økonomidelen.", color = C.text2)
            OutlinedTextField(server, { server = it }, label = { Text("Serveradresse") }, placeholder = { Text("192.168.1.20:8080") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = ServerKeyboard, shape = RoundedCornerShape(16.dp),
                supportingText = { Text("F.eks. 192.168.1.20:8080 (http) eller os.dittdomene.no (https)") })
            OutlinedTextField(pw, { pw = it }, label = { Text("Passord") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go), keyboardActions = KeyboardActions(onGo = { vm.login(server, pw) }), shape = RoundedCornerShape(16.dp))
            Button(onClick = { vm.login(server, pw) }, enabled = server.isNotBlank() && pw.isNotBlank() && !vm.busy, modifier = Modifier.fillMaxWidth().height(56.dp), shape = RoundedCornerShape(28.dp),
                colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text(if (vm.busy) "Logger inn …" else "Logg inn", fontWeight = FontWeight.Bold) }
        }
    }
}

/** Adressefelt: URL-tastatur uten stor forbokstav eller autokorrektur (ødelegger adressen). */
private val ServerKeyboard = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next)

/* ---------------- Profilmeny ---------------- */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProfileMenu(vm: AppViewModel) {
    val ctx = LocalContext.current
    var server by remember { mutableStateOf(vm.server) }
    var pw by remember { mutableStateOf("") }
    val open: (String) -> Unit = { hash -> ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(vm.server.trimEnd('/') + "/finans/#/" + hash))) }
    ModalBottomSheet(onDismissRequest = { vm.menuOpen = false }, containerColor = C.surface1) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp, 0.dp, 20.dp, 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(C.surface2).padding(4.dp)) {
                listOf(Screen.Home to "Finans", Screen.Mat to "Matplan").forEach { (sc, label) ->
                    val on = if (sc == Screen.Mat) vm.screen == Screen.Mat else vm.screen != Screen.Mat
                    Box(Modifier.weight(1f).clip(RoundedCornerShape(24.dp)).background(if (on) C.container else Color.Transparent)
                        .clickable { vm.menuOpen = false; vm.go(sc) }.padding(12.dp), contentAlignment = Alignment.Center) {
                        Text(label, color = if (on) C.onContainer else C.text2, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            SectionLabel("Andre OS")
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                listOf("Subscription OS" to "abonnement", "Delte mapper" to "mapper", "Finn-handler" to "finn").forEachIndexed { i, (n, h) ->
                    Row(Modifier.fillMaxWidth().clip(itemShape(i, 3)).background(C.surface2).clickable { open(h) }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(n, Modifier.weight(1f)); Icon(Icons.AutoMirrored.Filled.OpenInNew, null, tint = C.text2)
                    }
                }
            }
            SectionLabel("Server")
            OutlinedTextField(server, { server = it }, label = { Text("Lokal adresse") }, singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = ServerKeyboard, shape = RoundedCornerShape(16.dp))
            OutlinedTextField(pw, { pw = it }, label = { Text("Passord") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go), shape = RoundedCornerShape(16.dp))
            Button(onClick = { vm.login(server, pw) { vm.menuOpen = false; vm.message = "Koblet til ${Api.normalizeServer(server)}" } },
                enabled = server.isNotBlank() && pw.isNotBlank() && !vm.busy, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp),
                colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text("Koble til", fontWeight = FontWeight.Bold) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { vm.menuOpen = false; vm.go(Screen.Me) }, Modifier.weight(1f), shape = RoundedCornerShape(26.dp)) { Text("Innstillinger") }
                OutlinedButton(onClick = { vm.menuOpen = false; vm.logout() }, Modifier.weight(1f), shape = RoundedCornerShape(26.dp)) { Text("Logg ut", color = C.primary) }
            }
        }
    }
}

/* ---------------- Matplan ---------------- */

private val sourceLabel = mapOf("gemini" to "Gemini", "hellofresh" to "HelloFresh", "fixed" to "Fast", "own" to "Egen")

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MatScreen(vm: AppViewModel) {
    val w = vm.week
    val today = java.time.LocalDate.now().toString()
    LaunchedEffect(Unit) { if (vm.week == null) runCatching { vm.loadWeek() }.onFailure { vm.message = it.message } }
    Page {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Matplan", style = MaterialTheme.typography.displaySmall, modifier = Modifier.weight(1f))
                Box(Modifier.size(44.dp).clip(CircleShape).background(C.container).clickable { vm.menuOpen = true }, contentAlignment = Alignment.Center) {
                    Text(initial(vm.boot?.settings?.name ?: ""), color = C.onContainer, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        item {
            Button(onClick = { vm.planWeek() }, modifier = Modifier.fillMaxWidth().height(56.dp), shape = RoundedCornerShape(28.dp),
                colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text("✦ Ny ukeplan med Gemini", fontWeight = FontWeight.Bold) }
        }
        if (w == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) } }
        else {
            item { Text("Estimert ukekost ${n0(w.weekCost)} kr${if (w.auto) " · automatisk hver søndag" else ""}", color = C.text2, fontSize = 13.sp, modifier = Modifier.padding(start = 8.dp)) }
            items(w.days, key = { it.date }) { d ->
                var pick by remember { mutableStateOf(false) }
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(C.surface1)
                        .then(if (d.date == today) Modifier.border(2.dp, C.accent, RoundedCornerShape(24.dp)) else Modifier).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(d.weekday.ifBlank { ddmm(d.date) }, color = C.text2, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        d.source?.let { Text(sourceLabel[it] ?: it, fontSize = 12.sp, color = C.onContainer, modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(C.container).padding(8.dp, 3.dp)) }
                    }
                    Text(d.name ?: "Ingen rett ennå", style = MaterialTheme.typography.titleMedium, color = if (d.name == null) C.text2 else C.text)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box {
                            AssistChip(onClick = { pick = true }, label = { Text(d.cook ?: "Velg kokk") }, leadingIcon = { Icon(Icons.Filled.Person, null, Modifier.size(16.dp)) })
                            DropdownMenu(expanded = pick, onDismissRequest = { pick = false }) {
                                w.cooks.forEach { c -> DropdownMenuItem(text = { Text(c) }, onClick = { pick = false; vm.setCook(d.date, c) }) }
                            }
                        }
                        d.cost?.let { Text("${n0(it)} kr", fontFamily = Mono, color = C.text2) }
                        Spacer(Modifier.weight(1f))
                        FilterChip(selected = d.fixed, onClick = { vm.toggleFixed(d) }, label = { Text("Fast") },
                            colors = FilterChipDefaults.filterChipColors(selectedContainerColor = C.positiveBg, selectedLabelColor = C.positive))
                        FilledTonalIconButton(onClick = { vm.planDay(d.date) }) { Text("✦") }
                    }
                }
            }
            if (w.shopping.isNotEmpty()) {
                item { SectionLabel("Handleliste") }
                item { ShoppingList(vm, w) }
            }
        }
    }
}

@Composable
private fun ShoppingList(vm: AppViewModel, w: Week) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        w.shopping.forEachIndexed { i, sh ->
            Row(Modifier.fillMaxWidth().clip(itemShape(i, w.shopping.size)).background(C.surface1).clickable { vm.toggleShop(sh.id) }.padding(8.dp, 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = sh.done, onCheckedChange = { _ -> vm.toggleShop(sh.id) }, colors = CheckboxDefaults.colors(checkedColor = C.primary, checkmarkColor = C.onPrimary))
                Text(sh.text, color = if (sh.done) C.text2 else C.text)
            }
        }
    }
}

@Composable
private fun ShoppingPane(vm: AppViewModel) {
    val w = vm.week ?: return Empty("Laster …")
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Handleliste", style = MaterialTheme.typography.headlineMedium)
        if (w.shopping.isEmpty()) Empty("Handlelisten er tom.") else ShoppingList(vm, w)
    }
}

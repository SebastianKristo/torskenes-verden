package no.kristo.finanshub.ui

import android.graphics.Bitmap
import android.net.Uri
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
    Screen.Scan to Icons.Filled.DocumentScanner, Screen.Me to Icons.Filled.Person,
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
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri -> uri?.let(vm::uploadUri) }
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
                listOf(Screen.Home, Screen.List, Screen.Budget, Screen.Me).forEach { s ->
                    NavigationBarItem(selected = vm.screen == s, onClick = { vm.go(s) }, icon = { Icon(icons.getValue(s), null) }, label = { Text(s.label) })
                }
            }
        },
        floatingActionButton = {
            if (!twoPane && vm.screen != Screen.Scan) ExtendedFloatingActionButton(
                onClick = scan, containerColor = C.primary, contentColor = C.onPrimary, shape = RoundedCornerShape(20.dp),
                icon = { Icon(Icons.Filled.DocumentScanner, null) }, text = { Text("Skann", fontWeight = FontWeight.Bold) },
            )
        },
    ) { pad ->
        Row(Modifier.fillMaxSize().padding(pad)) {
            if (twoPane) NavigationRail(containerColor = C.surface1, header = {
                FloatingActionButton(onClick = scan, containerColor = C.primary, contentColor = C.onPrimary, shape = RoundedCornerShape(16.dp)) { Icon(Icons.Filled.DocumentScanner, "Skann") }
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
}

@Composable
private fun MainPane(vm: AppViewModel, twoPane: Boolean, scan: () -> Unit, pick: () -> Unit) {
    when (vm.screen) {
        Screen.Home -> HomeScreen(vm)
        Screen.List -> ListScreen(vm, twoPane)
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
        else -> TxDetail(vm)
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

/** Liste-elementer i M3 Expressive: første og siste har stor runding, de i midten liten. */
private fun itemShape(i: Int, n: Int) = when {
    n == 1 -> RoundedCornerShape(24.dp)
    i == 0 -> RoundedCornerShape(24.dp, 24.dp, 6.dp, 6.dp)
    i == n - 1 -> RoundedCornerShape(6.dp, 6.dp, 24.dp, 24.dp)
    else -> RoundedCornerShape(6.dp)
}

@Composable
private fun TxRow(t: Tx, shape: RoundedCornerShape, selected: Boolean = false, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(shape).background(if (selected) C.surface3 else C.surface1).clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Initial(t.description, t.color)
        Column(Modifier.weight(1f)) {
            Text(t.description, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${ddmm(t.date)} · ${t.category}", color = C.text2, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(signed(t.amount), fontFamily = Mono, fontWeight = FontWeight.SemiBold, color = if (t.amount > 0) C.positive else C.text)
    }
}

@Composable
private fun TxGroup(list: List<Tx>, vm: AppViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        list.forEachIndexed { i, t -> TxRow(t, itemShape(i, list.size), vm.selectedTx == t.id) { vm.selectedTx = t.id } }
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
                Box(Modifier.size(44.dp).clip(CircleShape).background(C.container).clickable { vm.go(Screen.Me) }, contentAlignment = Alignment.Center) { Text(initial(name), color = C.onContainer, fontWeight = FontWeight.SemiBold) }
            }
        }
        item { Hero(vm) }
        if (s != null) item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Tile("Inn", n0(s.inn), RoundedCornerShape(24.dp), C.surface2, Modifier.weight(1f))
                Tile("Spart i år", if (s.yearGoal > 0) "${n0(s.savedYear / s.yearGoal * 100)} %" else n0(s.savedYear), RoundedCornerShape(24.dp, 24.dp, 24.dp, 8.dp), C.surface3, Modifier.weight(1f))
            }
        }
        item { ReviewCta(vm) }
        item { SectionLabel("Siste") }
        item { s?.recent?.take(6)?.let { TxGroup(it, vm) } ?: Empty("Laster …") }
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
                shape = RoundedCornerShape(28.dp), modifier = Modifier.fillMaxWidth(),
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
        item { Hero(vm) }
        if (list.isEmpty()) item { Empty("Ingen budsjett satt. Sett opp i FinansHub på nettet.") }
        items(list, key = { it.categoryId }) { b ->
            val over = b.used > b.budget
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
private fun TxDetail(vm: AppViewModel) {
    val pool = (vm.txs ?: emptyList()) + (vm.summary?.recent ?: emptyList())
    val t = pool.firstOrNull { it.id == vm.selectedTx } ?: pool.firstOrNull() ?: return Empty("Ingen transaksjon valgt.")
    val cats = vm.boot?.categories ?: emptyList()
    var open by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Initial(t.description, t.color, 56, RoundedCornerShape(18.dp))
            Column { Text(t.description, style = MaterialTheme.typography.titleLarge); Text(dayLabel(t.date), color = C.text2) }
        }
        Row(verticalAlignment = Alignment.Bottom) {
            Text(signed(t.amount), fontFamily = Mono, fontSize = 40.sp, fontWeight = FontWeight.SemiBold, color = if (t.amount > 0) C.positive else C.text)
            Text(" kr", color = C.text2, fontSize = 18.sp, modifier = Modifier.padding(bottom = 8.dp))
        }
        listOf("Kategori" to t.category, "Konto" to t.account, "Kvittering" to when (t.receipt) { "booked" -> "Vedlagt"; null -> "–"; else -> "Til gjennomgang" })
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
        item { Text("Skann", style = MaterialTheme.typography.displaySmall, modifier = Modifier.padding(top = 8.dp)) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = scan, modifier = Modifier.weight(2f).height(64.dp), shape = RoundedCornerShape(28.dp, 8.dp, 8.dp, 28.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) {
                    Icon(Icons.Filled.PhotoCamera, null); Spacer(Modifier.width(8.dp)); Text("Ta bilde", fontWeight = FontWeight.Bold)
                }
                OutlinedButton(onClick = pick, modifier = Modifier.weight(1f).height(64.dp), shape = RoundedCornerShape(8.dp, 28.dp, 28.dp, 8.dp)) { Text("Velg fil") }
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
            OutlinedTextField(server, { server = it }, label = { Text("Serveradresse") }, placeholder = { Text("https://os.dittdomene.no") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next), shape = RoundedCornerShape(16.dp))
            OutlinedTextField(pw, { pw = it }, label = { Text("Passord") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go), keyboardActions = KeyboardActions(onGo = { vm.login(server, pw) }), shape = RoundedCornerShape(16.dp))
            Button(onClick = { vm.login(server, pw) }, enabled = server.isNotBlank() && pw.isNotBlank() && !vm.busy, modifier = Modifier.fillMaxWidth().height(56.dp), shape = RoundedCornerShape(28.dp),
                colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text(if (vm.busy) "Logger inn …" else "Logg inn", fontWeight = FontWeight.Bold) }
        }
    }
}

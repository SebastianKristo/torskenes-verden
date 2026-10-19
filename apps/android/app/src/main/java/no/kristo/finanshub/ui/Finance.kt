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


/* ---------------- Felles ---------------- */

@Composable
internal fun Page(content: LazyListScopeContent) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 12.dp, 16.dp, 180.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
}
internal typealias LazyListScopeContent = androidx.compose.foundation.lazy.LazyListScope.() -> Unit

@Composable
internal fun Empty(text: String) = Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { Text(text, color = C.text2) }

@Composable
internal fun SectionLabel(text: String) {
    // Papir: etiketter i IBM Plex Mono, versaler og aksentfarge, som i designet.
    if (Tone.paper) PLabel(text, modifier = Modifier.padding(start = 6.dp, top = 10.dp))
    else Text(text, color = C.primary, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 8.dp, top = 8.dp))
}

@Composable
internal fun Initial(text: String, color: Long, size: Int = 40, shape: RoundedCornerShape = CircleShape) {
    val c = Color(color)
    Box(Modifier.size(size.dp).clip(shape).background(c.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
        Text(initial(text), color = c, fontWeight = FontWeight.Bold)
    }
}

/** Butikklogo (logoregisteret, ellers favicon via serverens cache) på hvit flate; initial når logoen mangler. */
@Composable
internal fun Logo(vm: AppViewModel, domain: String?, name: String, color: Long, size: Int = 40, shape: RoundedCornerShape = RoundedCornerShape((size / 4).dp)) {
    // Logoregisteret først (prompt 20): treff på domene eller butikktekst, fil fra /finans/api/logos/file/:id, bokstav i merkefargen.
    var bmp by remember(domain, name) { mutableStateOf<Bitmap?>(null) }
    var regColor by remember(domain, name) { mutableStateOf<Long?>(null) }
    LaunchedEffect(domain, name) {
        regColor = vm.logoItem(domain, name)?.color
        bmp = vm.logoFor(domain, name)
    }
    val b = bmp
    if (b == null) Initial(name, regColor ?: color, size, shape)
    else Box(Modifier.size(size.dp).clip(shape).background(Color.White).padding((size / 9).dp), contentAlignment = Alignment.Center) {
        Image(b.asImageBitmap(), null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
    }
}

@Composable
internal fun AiLine(text: String?) {
    if (!text.isNullOrBlank()) Text("✦ $text", color = C.accentLight, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

/** Liste-elementer i M3 Expressive: første og siste har stor runding, de i midten liten. */
internal fun itemShape(i: Int, n: Int) = when {
    n == 1 -> RoundedCornerShape(24.dp)
    i == 0 -> RoundedCornerShape(24.dp, 24.dp, 6.dp, 6.dp)
    i == n - 1 -> RoundedCornerShape(6.dp, 6.dp, 24.dp, 24.dp)
    else -> RoundedCornerShape(6.dp)
}

@Composable
internal fun TxRow(vm: AppViewModel, t: Tx, shape: RoundedCornerShape, selected: Boolean = false, onClick: () -> Unit) {
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
internal fun TxGroup(list: List<Tx>, vm: AppViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        list.forEachIndexed { i, t -> TxRow(vm, t, itemShape(i, list.size), vm.selectedTx == t.id) { vm.selectedTx = t.id } }
    }
}

@Composable
internal fun Hero(vm: AppViewModel) {
    val s = vm.summary ?: return Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) }
    val pct = if (s.budgetTotal > 0) (s.budgetUsed / s.budgetTotal).toFloat().coerceIn(0f, 1f) else 0f
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(32.dp, 32.dp, 32.dp, 8.dp)).background(C.primary)
            .clickable(enabled = vm.flag(AppPrefs.HIDE_AMOUNTS)) { Privacy.hidden = !Privacy.hidden }.padding(24.dp),
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
internal fun ReviewCta(vm: AppViewModel) {
    val q = vm.summary?.review?.filter { it.status == "needs_review" } ?: return
    if (q.isEmpty()) return
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(C.container).clickable { vm.open(Screen.Scan) }.padding(16.dp, 16.dp),
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
internal fun HomeScreen(vm: AppViewModel) {
    val s = vm.summary
    val name = vm.displayName
    Page {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    // Finans viser profilbilde og @brukernavn, ikke fullt navn.
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AvatarImage(vm, 24)
                        Text("@${vm.account?.username?.ifBlank { null } ?: name.split(' ').first().lowercase()}", color = C.text2, fontSize = 15.sp, maxLines = 1)
                    }
                    Text(monthLabel(s?.month ?: ""), style = MaterialTheme.typography.displaySmall)
                }
                if (vm.flag(AppPrefs.HIDE_AMOUNTS)) IconButton(onClick = { Privacy.hidden = !Privacy.hidden }) {
                    Icon(if (Privacy.hidden) Icons.Filled.Visibility else Icons.Filled.VisibilityOff, if (Privacy.hidden) "Vis beløp" else "Skjul beløp", tint = C.text2)
                }
                IconButton(onClick = { vm.refresh() }) { Icon(Icons.Filled.Refresh, "Oppdater", tint = C.text2) }
                Avatar(vm)
            }
        }
        item { Hero(vm) }
        // «N kvitteringer til gjennomgang» rett under saldokortet: teksten åpner køen, «Skann ›» åpner skannearket.
        (vm.reviewCount ?: s?.review?.count { it.status == "needs_review" })?.takeIf { it > 0 }?.let { n ->
            item { ReviewBanner(n, open = { vm.openReview() }, scan = { vm.scanSheet = true }, bg = C.accent, fg = Color.White) }
        }
        if (s != null) item {
            Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                InnCard(s, Modifier.weight(1f).fillMaxHeight())
                SavedCard(s, Modifier.weight(1f).fillMaxHeight())
            }
        }
        item { UploadPill(vm) }
        item { SectionLabel("Siste") }
        item { s?.recent?.take(6)?.let { TxGroup(it, vm) } ?: Empty("Laster …") }
    }
}

/** «Inn i oktober»: pil-badge og sju mini-stolper der siste (denne måneden) er grønn. */
@Composable
internal fun InnCard(s: Summary, modifier: Modifier) {
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
internal fun SavedCard(s: Summary, modifier: Modifier) {
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
internal fun UploadPill(vm: AppViewModel) {
    val active = vm.jobs.filter { it.status == "pending" || it.status == "processing" }
    val ready = vm.jobs.count { it.status == "needs_review" }
    if (active.isEmpty() && vm.uploading == 0 && ready == 0) return
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(C.surface2).clickable { vm.open(Screen.Scan) }.padding(16.dp, 12.dp),
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
internal fun Tile(label: String, value: String, shape: RoundedCornerShape, bg: Color, modifier: Modifier) {
    Column(modifier.clip(shape).background(bg).padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, color = C.text2, fontSize = 13.sp)
        Text(value, fontFamily = Mono, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
internal fun ListScreen(vm: AppViewModel, twoPane: Boolean) {
    val txs = vm.txs
    Page {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Transaksjoner", style = MaterialTheme.typography.displaySmall, modifier = Modifier.weight(1f))
                FilledTonalButton(onClick = { vm.newTx() }, shape = RoundedCornerShape(20.dp)) { Icon(Icons.Filled.Add, null); Spacer(Modifier.width(4.dp)); Text("Ny") }
                Spacer(Modifier.width(8.dp))
                Avatar(vm)
            }
        }
        item {
            TextField(
                value = vm.query, onValueChange = { vm.query = it }, placeholder = { Text("Søk i transaksjoner") },
                leadingIcon = { SearchLead27(vm.query.isNotEmpty(), C.text, C.text2, idle = { Icon(Icons.Filled.Search, null) }) { vm.query = "" } }, singleLine = true,
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
internal fun BudgetScreen(vm: AppViewModel) {
    val list = vm.summary?.budgets?.filter { it.budget > 0 }?.sortedByDescending { it.used / it.budget } ?: emptyList()
    Page {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Budsjett", style = MaterialTheme.typography.displaySmall, modifier = Modifier.weight(1f))
                Avatar(vm)
            }
        }
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
internal fun BudgetDetail(vm: AppViewModel) {
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
internal fun TxDetail(vm: AppViewModel, back: (() -> Unit)?) {
    val pool = vm.txPool
    val t = pool.firstOrNull { it.id == vm.selectedTx } ?: (if (back == null) pool.firstOrNull() else null)
        ?: return Column(Modifier.fillMaxSize().padding(20.dp)) {
            if (back != null) FilledTonalIconButton(onClick = back, modifier = Modifier.size(48.dp)) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Tilbake") }
            Empty(if (vm.selectedTx != null) "Laster transaksjonen …" else "Ingen transaksjon valgt.")
        }
    var confirm by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp, 20.dp, 20.dp, 120.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
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
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp, 28.dp, 28.dp, 10.dp)).background(C.heroAi).padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("✦ AI-beskrivelse", color = C.onContainer, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                Text(txt, color = C.onContainer)
            }
        }
        if (t.lines.isNotEmpty()) {
            SectionLabel("Varelinjer")
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(C.surface1).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                t.lines.forEach { (d, a) -> Row(Modifier.fillMaxWidth()) { Text(d, Modifier.weight(1f), maxLines = 2); Text(n2(a), fontFamily = Mono) } }
            }
        }
        SectionLabel("Originaler")
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            OriginalRow("Original kvittering", if (t.receipt == null) "Ingen vedlagt" else "Bilde eller PDF", Icons.Filled.Receipt, itemShape(0, 2)) { vm.openOriginal(t.id, "receipt") }
            OriginalRow("Original banktransaksjon", "Slik posten kom fra banken", Icons.Filled.AccountBalance, itemShape(1, 2)) { vm.openOriginal(t.id, "bank") }
        }
        val info = listOf("Kategori" to t.category, "Konto" to t.account, "Dato" to ddmmyyyy(t.date),
            "Kvittering" to when (t.receipt) { "booked" -> "Vedlagt"; null -> "–"; else -> "Til gjennomgang" }, "Bolig" to (t.folder ?: "–"))
            .plus(if (t.note.isNotBlank()) listOf("Notat" to t.note) else emptyList())
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            info.forEachIndexed { i, (k, v) ->
                Row(Modifier.fillMaxWidth().clip(itemShape(i, info.size)).background(C.surface1).padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(k, color = C.text2); Text(v, fontWeight = FontWeight.Medium)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { vm.editTx(t) }, modifier = Modifier.weight(1f).height(52.dp), shape = RoundedCornerShape(26.dp, 8.dp, 8.dp, 26.dp),
                colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Icon(Icons.Filled.Edit, null); Spacer(Modifier.width(6.dp)); Text("Rediger", fontWeight = FontWeight.Bold) }
            OutlinedButton(onClick = { confirm = true }, modifier = Modifier.weight(1f).height(52.dp), shape = RoundedCornerShape(8.dp, 26.dp, 26.dp, 8.dp)) { Text("Slett", color = C.red) }
        }
    }
    if (confirm) AlertDialog(onDismissRequest = { confirm = false }, title = { Text("Slette transaksjonen?") }, text = { Text("Den forsvinner fra liste, rapporter, budsjett og AI-søk.") },
        confirmButton = { TextButton(onClick = { confirm = false; vm.deleteTx(t.id) }) { Text("Slett", color = C.red) } },
        dismissButton = { TextButton(onClick = { confirm = false }) { Text("Avbryt") } })
}

@Composable
private fun OriginalRow(title: String, sub: String, icon: ImageVector, shape: RoundedCornerShape, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(shape).background(C.surface1).clickable(onClick = onClick).padding(16.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Icon(icon, null, tint = C.primary)
        Column(Modifier.weight(1f)) { Text(title, fontWeight = FontWeight.Medium); Text(sub, color = C.text2, fontSize = 13.sp) }
        Icon(Icons.Filled.ChevronRight, null, tint = C.text2)
    }
}

@Composable
internal fun ScanQueue(vm: AppViewModel, scan: () -> Unit, pick: () -> Unit) {
    val q = vm.receipts
    Page {
        item { ModuleHeader(vm, "Kvitteringer") }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = scan, modifier = Modifier.weight(2f).height(64.dp), shape = RoundedCornerShape(28.dp, 8.dp, 8.dp, 28.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) {
                    Icon(Icons.Filled.PhotoCamera, null); Spacer(Modifier.width(8.dp)); Text("Ta bilde", fontWeight = FontWeight.Bold)
                }
                OutlinedButton(onClick = pick, modifier = Modifier.weight(1f).height(64.dp), shape = RoundedCornerShape(8.dp, 28.dp, 28.dp, 8.dp)) { Text("Bilder / filer") }
            }
        }
        if (vm.pendingUploads.isNotEmpty()) {
            item { SectionLabel("Venter på opplasting${if (vm.flag(AppPrefs.WIFI_ONLY)) " (bare Wi-Fi)" else ""}") }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    val n = vm.pendingUploads.size
                    vm.pendingUploads.forEachIndexed { i, u ->
                        Row(Modifier.fillMaxWidth().clip(itemShape(i, n)).background(C.surface1).padding(16.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(u.name.ifBlank { "Kvittering" }, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(pendingSub(u), color = C.text2, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                            TextButton(onClick = { vm.removePending(u.id) }) { Text("Fjern") }
                        }
                    }
                }
            }
            item {
                OutlinedButton(onClick = { vm.retryPending() }, enabled = !vm.pendingBusy, modifier = Modifier.fillMaxWidth()) { Text(if (vm.pendingBusy) "Prøver …" else "Prøv igjen") }
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
                            "error" -> j.name to "Feilet · trykk for å analysere på nytt med Gemini"
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
                                if (r.canReanalyze || r.status == "error") IconButton(onClick = { vm.selectedReceipt = r.id; vm.reanalyze(r.id) }, enabled = vm.reanalyzing == null) {
                                    if (vm.reanalyzing == r.id) CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp)) else Text("✦", color = C.primary, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun JobRow(title: String, sub: String, progress: Int?, shape: RoundedCornerShape, onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(shape).background(C.surface1).clickable(onClick = onClick).padding(16.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(sub, color = if (sub.startsWith("Klar")) C.positive else C.text2, fontSize = 13.sp)
        if (progress != null) LinearProgressIndicator(progress = { progress / 100f }, Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)), color = C.primary, trackColor = C.surface2)
    }
}

@Composable
internal fun Thumb(vm: AppViewModel, path: String?) {
    var bmp by remember(path) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(path) { if (path != null) bmp = vm.image(path) }
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(C.paper)) {
        bmp?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ReceiptConfirm(vm: AppViewModel, back: (() -> Unit)?) {
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
        if (r.status == "pending" || r.status == "processing") {
            Column(Modifier.fillMaxWidth().padding(40.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                CircularProgressIndicator(color = C.primary); Text("Leser kvitteringen med ${if (st?.provider == "gemini") "Gemini" else "Ollama"} …", color = C.text2)
            }
            return@Column
        }
        ReceiptImage(vm, r)
        val high = r.error == null && r.flag == null && r.confidence >= (st?.minConf ?: 85) / 100.0
        // Feilet, lav sikkerhet eller usikker Ollama: la Gemini lese originalbildet på nytt.
        if (r.canReanalyze || r.status == "error" || !high) ReanalyzeButton(vm, r)
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
internal fun ReceiptImage(vm: AppViewModel, r: Receipt) {
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
internal fun EditField(label: String, value: String, key: Any, number: Boolean = false, modifier: Modifier = Modifier.fillMaxWidth(), onSave: (String) -> Unit) {
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


/** «✦ Analyser på nytt med Gemini» på bekreftelsessiden. */
@Composable
internal fun ReanalyzeButton(vm: AppViewModel, r: Receipt) {
    val busy = vm.reanalyzing == r.id
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        FilledTonalButton(onClick = { vm.reanalyze(r.id) }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp)) {
            if (busy) { CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(10.dp)); Text("Gemini leser kvitteringen …") }
            else Text("✦ Analyser på nytt med Gemini", fontWeight = FontWeight.SemiBold)
        }
        r.reanalyzeReason?.let { Text(it, color = C.text2, fontSize = 12.sp, modifier = Modifier.padding(start = 8.dp)) }
    }
    vm.reanalysis?.takeIf { it.receiptId == r.id }?.let { ReanalysisDialog(vm, it) }
}

/** Forrige tolkning og Gemini side om side. Brukeren velger hvilken som beholdes. */
@Composable
private fun ReanalysisDialog(vm: AppViewModel, a: Reanalysis) {
    AlertDialog(
        onDismissRequest = { vm.reanalysis = null },
        containerColor = C.surface1,
        title = { Text("Sammenlign tolkningene") },
        text = {
            Row(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ExtractColumn("Forrige", a.previous, a.result, Modifier.weight(1f))
                ExtractColumn("Gemini", a.result, a.previous, Modifier.weight(1f))
            }
        },
        confirmButton = { Button(onClick = { vm.applyReanalysis("new") }, colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text("Bruk Gemini") } },
        dismissButton = { TextButton(onClick = { vm.applyReanalysis("old") }) { Text("Behold forrige") } },
    )
}

@Composable
private fun ExtractColumn(title: String, e: ReExtract, other: ReExtract, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(18.dp)).background(C.surface2).padding(12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(title + (e.engine?.let { " · $it" } ?: ""), fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        ExtractField("Butikk", e.merchant ?: "–", e.merchant != other.merchant)
        ExtractField("Dato", e.date?.let(::ddmmyyyy) ?: "–", e.date != other.date)
        ExtractField("Total", e.total?.let { n2(it) + " kr" } ?: "–", e.total != other.total)
        ExtractField("Varelinjer", "${e.items.size}", e.items.size != other.items.size)
        ExtractField("Sikkerhet", e.confidence?.let { "${(if (it <= 1) it * 100 else it).toInt()} %" } ?: "–", false)
    }
}

@Composable
private fun ExtractField(label: String, v: String, diff: Boolean) {
    Text(label, color = C.text2, fontSize = 11.sp)
    Text(v, fontWeight = if (diff) FontWeight.Bold else FontWeight.Normal, color = if (diff) C.primary else C.text, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
}

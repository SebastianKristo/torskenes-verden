package no.kristo.finanshub.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import no.kristo.finanshub.*
import java.io.File
import java.time.LocalDate

/* ---------------- Byggeklosser for Mer-sidene ---------------- */

@Composable
private fun SubText(text: String) = Text(text, color = C.text2, fontSize = 13.sp, modifier = Modifier.padding(start = 8.dp))

@Composable
private fun PageHero(label: String, value: String, sub: String?, extra: @Composable ColumnScope.() -> Unit = {}) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(32.dp, 32.dp, 32.dp, 8.dp)).background(C.primary).padding(22.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, color = C.onPrimary, fontWeight = FontWeight.SemiBold)
        Text(value, color = C.onPrimary, fontFamily = Mono, fontSize = 34.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, softWrap = false)
        sub?.let { Text(it, color = C.onPrimary.copy(alpha = .8f), fontSize = 13.sp) }
        extra()
    }
}

@Composable
private fun Group(title: String?, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        if (!title.isNullOrBlank()) SectionLabel(title)
        content()
    }
}

/** Elementrad: logo/initial, tittel, undertekst, ✦ og verdi. Trykk åpner detaljsiden. */
@Composable
private fun ItemRow(vm: AppViewModel, i: Int, n: Int, title: String, sub: String?, value: String?, valueColor: Color = C.text, domain: String? = null, color: Long = 0xFFFF7A3D,
                    ai: String? = null, trailing: (@Composable () -> Unit)? = null, onClick: (() -> Unit)?) {
    Row(Modifier.fillMaxWidth().clip(itemShape(i, n)).background(C.surface1).then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(16.dp, 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Logo(vm, domain, title, color, 36)
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            sub?.let { Text(it, color = C.text2, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) }
            AiLine(ai)
        }
        value?.let { Text(it, fontFamily = Mono, fontWeight = FontWeight.SemiBold, color = valueColor, maxLines = 1, softWrap = false) }
        trailing?.invoke()
    }
}

@Composable
private fun BarRow(label: String, value: String, fraction: Double, color: Color, sub: String? = null) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(C.surface1).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row { Text(label, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis); Text(value, fontFamily = Mono, fontSize = 14.sp) }
        LinearProgressIndicator(progress = { fraction.toFloat().coerceIn(0f, 1f) }, Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)), color = color, trackColor = C.surface2)
        sub?.let { Text(it, color = C.text2, fontSize = 12.sp) }
    }
}

@Composable
private fun Loading() = Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) }

@Composable
private fun PrimaryButton(text: String, enabled: Boolean = true, onClick: () -> Unit) =
    Button(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp),
        colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text(text, fontWeight = FontWeight.Bold) }

private fun kr(v: Double) = "${n0(v)} kr"
private fun sgn(v: Double) = if (v < 0) "−" else "+"

/* ---------------- Mer ---------------- */

private data class MoreTile(val screen: Screen, val sub: String, val badge: Int = 0)

/** Mer: alt fra FinansHub på nettsiden, som fliser med levende tall. */
@Composable
internal fun MoreScreen(vm: AppViewModel) {
    val b = vm.boot
    val tiles = listOf(
        MoreTile(Screen.Scan, "${b?.reviewCount ?: 0} til gjennomgang", b?.reviewCount ?: 0),
        MoreTile(Screen.Fast, vm.recurring?.filter { it.active }?.sumOf { it.monthly }?.let { "${kr(it)}/mnd" } ?: "Trekk og regninger"),
        MoreTile(Screen.Accounts, b?.accounts?.sumOf { it.balance }?.let { kr(it) } ?: "Saldo og sparemål"),
        MoreTile(Screen.Stocks, vm.stocks?.summary?.let { kr(it.value) } ?: "Trading 212"),
        MoreTile(Screen.Reports, "Måned og år"),
        MoreTile(Screen.Sub, vm.subs?.let { "${kr(it.monthly)}/mnd" } ?: "Abonnementer"),
        MoreTile(Screen.Folders, vm.folders?.let { "${it.size} boliger" } ?: "Bolig og felles"),
        MoreTile(Screen.Finn, vm.finn?.let { "${it.ongoing} pågående" } ?: "Kjøp og salg"),
        MoreTile(Screen.Import, "CSV, XLSX, tekst"),
        MoreTile(Screen.Search, "Spør om alt"),
    )
    Page {
        item { ModuleHeader(vm, "Mer") }
        item { SubText("Alt fra FinansHub på nettsiden") }
        tiles.chunked(2).forEach { row ->
            item(key = row.first().screen.name) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEachIndexed { i, t ->
                        Column(
                            Modifier.weight(1f).clip(if (i == 0) RoundedCornerShape(28.dp, 10.dp, 10.dp, 28.dp) else RoundedCornerShape(10.dp, 28.dp, 28.dp, 10.dp)).background(C.surface1)
                                .clickable { if (t.screen == Screen.Search) vm.go(Screen.Search) else vm.open(t.screen) }.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(40.dp).clip(RoundedCornerShape(14.dp)).background(C.container), contentAlignment = Alignment.Center) { Icon(screenIcon(t.screen), null, tint = C.onContainer) }
                                Spacer(Modifier.weight(1f))
                                if (t.badge > 0) Text("${t.badge}", color = C.onPrimary, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.clip(CircleShape).background(C.primary).padding(8.dp, 2.dp))
                            }
                            Text(t.screen.label, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(t.sub, color = C.text2, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
        item {
            var q by remember { mutableStateOf("") }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(C.surface2).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("✦ Spør AI", fontWeight = FontWeight.SemiBold, color = C.accentLight)
                Text("Søker i transaksjoner, kvitteringer og varelinjer", color = C.text2, fontSize = 12.sp)
                OutlinedTextField(q, { q = it }, placeholder = { Text("Hvor mye brukte jeg på kaffe?") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { vm.ask(q); vm.go(Screen.Search) }))
                PrimaryButton("Spør", q.isNotBlank()) { vm.ask(q); vm.go(Screen.Search) }
            }
        }
    }
}

/* ---------------- Søk (✦ AI og vanlig søk) ---------------- */

private val AI_SUGGESTIONS = listOf("Hvor mye har jeg brukt på kaffe?", "Når kjøpte jeg lyspærer?", "Mat i oktober", "Hva har jeg betalt for lading?")
/** Forslag før søk når serveren ikke har /search/suggestions. */
private val FALLBACK_GROUPS = listOf(
    SuggestGroup("Butikker", listOf("Sist jeg var på Rema 1000", "Sist jeg var på Biltema")),
    SuggestGroup("Varer i kvitteringer", listOf("Kvitteringer med tomater", "Kvitteringer med kaffe")),
    SuggestGroup("Beløp og perioder", listOf("Over 500 kr i oktober", "Største utgift", "Til gjennomgang")),
)

/** Søk-fanen: feltet får fokus med en gang, så tastaturet kommer opp. Enter søker. */
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
internal fun SearchScreen(vm: AppViewModel) {
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    var q by remember { mutableStateOf(vm.aiQuery) }
    LaunchedEffect(Unit) { delay(120); runCatching { focus.requestFocus() }; keyboard?.show() }
    val r = vm.ai
    val ai = vm.searchMode != "plain"
    val search: (String) -> Unit = { t -> q = t; keyboard?.hide(); vm.ask(t) }
    Page {
        item { ModuleHeader(vm, "Søk") }
        item {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SegmentedButton(selected = ai, onClick = { vm.setPref(AppPrefs.SEARCH_MODE, "ai") }, shape = SegmentedButtonDefaults.itemShape(0, 2),
                    colors = SegmentedButtonDefaults.colors(activeContainerColor = C.container, activeContentColor = C.onContainer)) { Text("✦ AI") }
                SegmentedButton(selected = !ai, onClick = { vm.setPref(AppPrefs.SEARCH_MODE, "plain") }, shape = SegmentedButtonDefaults.itemShape(1, 2),
                    colors = SegmentedButtonDefaults.colors(activeContainerColor = C.container, activeContentColor = C.onContainer)) { Text("Vanlig søk") }
            }
        }
        item {
            SubText(if (ai) "${if (vm.boot?.settings?.provider == "gemini") "Gemini" else "Ollama"} · leser også innholdet i kvitteringene. Er AI av, brukes vanlig søk."
                else "Butikker, kategorier, notater og varelinjene i kvitteringene")
        }
        item {
            TextField(
                value = q, onValueChange = { q = it }, placeholder = { Text(if (ai) "f.eks. Når kjøpte jeg lyspærer?" else "f.eks. kvitteringer med tomater") },
                leadingIcon = { if (ai) Text("✦", color = C.accentLight, fontSize = 18.sp) else Icon(Icons.Filled.Search, null, tint = C.text2) }, singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { search(q) }),
                shape = RoundedCornerShape(28.dp), modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).focusRequester(focus),
                colors = TextFieldDefaults.colors(focusedContainerColor = C.surface2, unfocusedContainerColor = C.surface2, focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent),
            )
        }
        item { PrimaryButton(if (vm.aiBusy) "Søker …" else if (ai) "Spør AI" else "Søk", q.isNotBlank() && !vm.aiBusy) { search(q) } }
        if (r == null && !vm.aiBusy) {
            // Før søk: forslag i tre grupper.
            (vm.suggestGroups.ifEmpty { FALLBACK_GROUPS }).forEach { g ->
                item {
                    Group(g.title) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            g.items.forEach { t -> AssistChip(onClick = { search(t) }, label = { Text(t) }) }
                        }
                    }
                }
            }
        }
        if (vm.aiBusy) item { Loading() }
        if (r != null && !vm.aiBusy) {
            vm.aiNote?.let { n -> item { Text(n, color = C.accentLight, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 8.dp)) } }
            item {
                val plain = r.mode == "plain"
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp, 28.dp, 28.dp, 10.dp)).background(if (plain) C.surface2 else C.heroAi).padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(if (plain) "Vanlig søk · ${r.hits.size} treff" else "✦ Svar" + (r.engine?.let { " · $it" } ?: ""),
                        color = if (plain) C.text2 else C.onContainer, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    Text(r.answer.ifBlank { "Fant ingen treff. Prøv et butikknavn, en kategori eller en vare fra kvitteringen." }, color = if (plain) C.text else C.onContainer)
                }
            }
            if (r.stores.isNotEmpty()) item {
                Group("Butikker") {
                    r.stores.forEachIndexed { i, st ->
                        ItemRow(vm, i, r.stores.size, st.name, listOfNotNull("${st.count} kjøp", st.last?.let { "sist ${ddmmyyyy(it)}" }).joinToString(" · "), null,
                            onClick = { search("Sist jeg var på ${st.name}") })
                    }
                }
            }
            if (r.hits.isNotEmpty()) item {
                Group("Treff") {
                    r.hits.forEachIndexed { i, h ->
                        val sub = listOfNotNull(listOfNotNull(h.date?.let(::ddmm), h.source).joinToString(" · ").ifBlank { null }, h.reason).joinToString("\n")
                        ItemRow(vm, i, r.hits.size, h.description, sub.ifBlank { null },
                            h.amount?.let { signed(it) }, if ((h.amount ?: 0.0) > 0) C.positive else C.text,
                            onClick = h.txId?.let { id -> { vm.showTx(id, h.description); Unit } })
                    }
                }
            }
            if (r.followUps.isNotEmpty()) item {
                Group("Prøv også") {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        r.followUps.forEach { t -> SuggestionChip(onClick = { search(t) }, label = { Text(t) }) }
                    }
                }
            }
            val more = r.suggestions.ifEmpty { if (r.followUps.isEmpty()) AI_SUGGESTIONS else emptyList() }
            if (more.isNotEmpty()) item {
                Group("Flere forslag") {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        more.forEach { t -> AssistChip(onClick = { search(t) }, label = { Text(t) }) }
                    }
                }
            }
        }
        if (vm.aiHistory.isNotEmpty()) item {
            Group(null) {
                Row(Modifier.fillMaxWidth().padding(start = 8.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Tidligere søk", color = C.primary, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    TextButton(onClick = { vm.clearAiHistory() }) { Text("Tøm", color = C.primary) }
                }
                val list = vm.aiHistory.take(8)
                list.forEachIndexed { i, t ->
                    Row(Modifier.fillMaxWidth().clip(itemShape(i, list.size)).background(C.surface1).clickable { search(t) }.padding(16.dp, 12.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Icon(Icons.Filled.History, null, tint = C.text2, modifier = Modifier.size(18.dp))
                        Text(t, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

/* ---------------- Faste utgifter ---------------- */

@Composable
internal fun FastScreen(vm: AppViewModel) {
    val list = vm.recurring
    Page {
        item { ModuleHeader(vm, "Faste utgifter") }
        vm.moduleError?.let { e -> item { Empty(e) } }
        if (list == null && vm.moduleError == null) item { Loading() }
        if (list != null) {
            val m = list.filter { it.active }.sumOf { it.monthly }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Kpi("Per måned", kr(m), Modifier.weight(1f), RoundedCornerShape(28.dp, 8.dp, 8.dp, 28.dp), sub = "${list.count { it.active }} aktive")
                    Kpi("Per år", kr(m * 12), Modifier.weight(1f), RoundedCornerShape(8.dp, 28.dp, 28.dp, 8.dp), sub = "Med dagens trekk")
                }
            }
            if (list.isEmpty()) item { Empty("Ingen faste utgifter funnet ennå.") }
            item {
                Group("Trekk") {
                    list.sortedBy { it.day ?: 99 }.forEachIndexed { i, r ->
                        ItemRow(vm, i, list.size, r.name, listOfNotNull(r.day?.let { "Den $it. hver måned" }, r.category).joinToString(" · "), kr(kotlin.math.abs(r.amount)),
                            if (r.active) C.text else C.text2,
                            trailing = { Switch(checked = r.active, onCheckedChange = { vm.setRecurringActive(r, it) }, colors = SwitchDefaults.colors(checkedTrackColor = C.primary, checkedThumbColor = C.onPrimary)) },
                            onClick = {
                                vm.openDetail(DetailInfo(r.name, r.category, kr(kotlin.math.abs(r.amount)), "per trekk", listOf("Trekk" to listOfNotNull(
                                    r.day?.let { "Trekkdato" to "Den $it. hver måned" }, "Kategori" to (r.category ?: "–"), "Per måned" to kr(r.monthly), "Per år" to kr(r.monthly * 12),
                                    "Neste" to ddmmyyyy(r.next), "Status" to if (r.active) "Aktiv" else "Av")), r.name))
                            })
                    }
                }
            }
            item { SubText("Oppdages automatisk fra gjentakende transaksjoner. Skru av det som ikke lenger trekkes.") }
        }
    }
}

/* ---------------- Kontoer ---------------- */

@Composable
internal fun AccountsScreen(vm: AppViewModel) {
    val b = vm.boot
    Page {
        item { ModuleHeader(vm, "Kontoer") }
        if (b == null) item { Loading() } else {
            item { PageHero("Total saldo", "${neg0(b.accounts.sumOf { it.balance })} kr", "${b.accounts.size} kontoer") }
            item {
                Group("Kontoer") {
                    b.accounts.forEachIndexed { i, a ->
                        ItemRow(vm, i, b.accounts.size, a.name, listOfNotNull(a.type.takeIf { it.isNotBlank() }, a.last4?.let { "•••• $it" }).joinToString(" · "),
                            "${neg0(a.balance)} kr", if (a.balance < 0) C.accentLight else C.text, onClick = {
                                vm.openDetail(DetailInfo(a.name, a.type, "${neg0(a.balance)} kr", "Saldo", listOf("Konto" to listOfNotNull(
                                    "Type" to a.type, a.last4?.let { "Kontonummer" to "•••• $it" }, "Saldo" to "${n2(a.balance)} kr"))))
                            })
                    }
                }
            }
            if (b.goals.isNotEmpty()) item {
                Group("Sparemål") {
                    b.goals.forEach { g ->
                        val done = g.target > 0 && g.saved >= g.target
                        BarRow(g.name, "${n0(g.saved)} / ${n0(g.target)} kr", if (g.target > 0) g.saved / g.target else 0.0, if (done) C.positive else C.primary,
                            if (done) "Nådd ✓" else if (g.target > 0) "${(g.saved / g.target * 100).toInt()} % · ${kr(g.target - g.saved)} igjen" else null)
                    }
                }
            }
        }
    }
}

/* ---------------- Aksjer (Trading 212) ---------------- */

private val PERIODS = listOf("1D" to 2, "1U" to 7, "1M" to 31, "1Å" to 366, "Alt" to Int.MAX_VALUE)

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun StocksScreen(vm: AppViewModel) {
    val s = vm.stocks
    Page {
        item { ModuleHeader(vm, "Aksjer", actions = { IconButton(onClick = { vm.syncStocks() }) { Icon(Icons.Filled.Sync, "Synk nå", tint = C.primary) } }) }
        item { SubText("Trading 212 · ${s?.status ?: "Invest"}") }
        vm.moduleError?.let { e -> item { Empty(e) } }
        if (s == null && vm.moduleError == null) item { Loading() }
        if (s != null && !s.configured && !s.mock) item {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(C.surface1).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Ikke koblet til Trading 212", fontWeight = FontWeight.SemiBold)
                Text("Lag en API-nøkkel hos Trading 212 under Innstillinger → API (Beta). Gi bare lesetilgang (account, portfolio, history:orders, history:dividends), og lås den gjerne til IP-en til homelaben. Nøkkel og secret legges inn i FinansHub på PC og lagres bare på serveren.",
                    color = C.text2, fontSize = 13.sp)
            }
        }
        val sm = s?.summary
        if (s != null && sm != null) {
            val days = PERIODS.firstOrNull { it.first == vm.stockPeriod }?.second ?: 31
            val hist = s.history.takeLast(days.coerceAtMost(s.history.size)).map { it.second }
            item {
                PageHero("Porteføljeverdi", kr(sm.value), "${sgn(sm.result)}${kr(kotlin.math.abs(sm.result))}${if (sm.invested > 0) " (${pct(sm.result / sm.invested * 100)})" else ""} totalt") {
                    if (hist.size > 1) Spark(hist, C.onPrimary, Modifier.fillMaxWidth().height(56.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        PERIODS.forEach { (k, _) ->
                            val on = vm.stockPeriod == k
                            Text(k, color = if (on) C.primary else C.onPrimary, fontWeight = FontWeight.SemiBold, fontSize = 13.sp,
                                modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(if (on) C.onPrimary else C.onPrimary.copy(alpha = .14f)).clickable { vm.stockPeriod = k }.padding(10.dp, 4.dp))
                        }
                    }
                }
            }
            val day = s.positions.sumOf { it.value * it.dayPct / 100 }
            val divYear = s.dividends.filter { it.date.startsWith(LocalDate.now().year.toString()) }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Kpi("I dag", "${sgn(day)}${kr(kotlin.math.abs(day))}", Modifier.weight(1f), RoundedCornerShape(28.dp, 8.dp, 8.dp, 8.dp), fg = if (day < 0) C.accentLight else C.positive, sub = "Siden åpning")
                        Kpi("Kontanter", kr(sm.cash), Modifier.weight(1f), RoundedCornerShape(8.dp, 28.dp, 8.dp, 8.dp), sub = "Ledig å investere")
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Kpi("Utbytte i år", kr(divYear.sumOf { it.amount }), Modifier.weight(1f), RoundedCornerShape(8.dp, 8.dp, 8.dp, 28.dp), sub = "${divYear.size} utbetalinger")
                        Kpi("Avkastning", "${sgn(sm.result)}${kr(kotlin.math.abs(sm.result))}", Modifier.weight(1f), RoundedCornerShape(8.dp, 8.dp, 28.dp, 8.dp), fg = if (sm.result < 0) C.accentLight else C.positive, sub = "Siden kjøp")
                    }
                }
            }
            if (s.positions.isNotEmpty()) item {
                Group("Posisjoner") {
                    s.positions.forEachIndexed { i, p ->
                        ItemRow(vm, i, s.positions.size, p.name, "${fmtQty(p.quantity)} stk · snitt ${n0(p.avg)} · kurs ${n0(p.price)}", kr(p.value),
                            trailing = { Text("${sgn(p.plPct)}${pct(kotlin.math.abs(p.plPct))}", color = if (p.plPct < 0) C.accentLight else C.positive, fontSize = 12.sp) },
                            onClick = {
                                vm.openDetail(DetailInfo(p.name, "${p.symbol} · Trading 212", kr(p.value), "${sgn(p.pl)}${kr(kotlin.math.abs(p.pl))} (${sgn(p.plPct)}${pct(kotlin.math.abs(p.plPct))}) siden kjøp", listOf(
                                    "Posisjon" to listOf("Antall" to "${fmtQty(p.quantity)} stk", "Snittkurs" to "${n2(p.avg)} kr", "Kurs nå" to "${n2(p.price)} kr", "Kostpris" to kr(p.quantity * p.avg),
                                        "Andel av portefølje" to if (sm.value > 0) "${(p.value / sm.value * 100).toInt()} %" else "–"),
                                    "Utvikling" to listOf("I dag" to "${sgn(p.dayPct)}${pct(kotlin.math.abs(p.dayPct))}", "Totalt" to "${sgn(p.plPct)}${pct(kotlin.math.abs(p.plPct))}",
                                        "Utbytte i år" to kr(divYear.filter { it.symbol == p.symbol }.sumOf { it.amount })))))
                            })
                    }
                }
            }
            if (s.positions.isNotEmpty() && sm.value > 0) item {
                Group("Fordeling") { s.positions.sortedByDescending { it.value }.forEach { p -> BarRow(p.name, "${(p.value / sm.value * 100).toInt()} %", p.value / sm.value, C.primary) } }
            }
            if (s.orders.isNotEmpty()) item {
                Group("Ordrer") {
                    s.orders.take(20).forEachIndexed { i, o ->
                        ItemRow(vm, i, minOf(20, s.orders.size), "${o.side} ${o.symbol}", "${ddmmyyyy(o.date)} · ${fmtQty(o.quantity)} stk à ${n2(o.price)}", kr(o.value), onClick = null)
                    }
                }
            }
            if (s.dividends.isNotEmpty()) item {
                Group("Utbytte") {
                    s.dividends.forEachIndexed { i, d -> ItemRow(vm, i, s.dividends.size, d.symbol, ddmmyyyy(d.date), "+${n2(d.amount)}", C.positive, onClick = null) }
                }
            }
            item { PrimaryButton("Synk nå") { vm.syncStocks() } }
            item { SubText("API-nøkkel og secret ligger på serveren. Endres i FinansHub på PC under Innstillinger → Aksjer · Trading 212.") }
        }
    }
}

private fun fmtQty(q: Double) = if (q == kotlin.math.floor(q)) q.toLong().toString() else String.format(java.util.Locale("nb", "NO"), "%.4f", q).trimEnd('0').trimEnd(',')

@Composable
internal fun Spark(values: List<Double>, color: Color, modifier: Modifier) {
    Canvas(modifier) {
        val mx = values.maxOrNull() ?: return@Canvas
        val mn = values.minOrNull() ?: return@Canvas
        val span = (mx - mn).takeIf { it > 0 } ?: 1.0
        val p = Path()
        values.forEachIndexed { i, v ->
            val x = size.width * i / (values.size - 1).coerceAtLeast(1)
            val y = size.height - ((v - mn) / span * size.height).toFloat()
            if (i == 0) p.moveTo(x, y) else p.lineTo(x, y)
        }
        drawPath(p, color, style = Stroke(2.dp.toPx()))
    }
}

/* ---------------- Rapporter ---------------- */

@Composable
internal fun ReportsScreen(vm: AppViewModel) {
    val r = vm.report
    val uri = LocalUriHandler.current
    Page {
        item { ModuleHeader(vm, "Rapporter") }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = !vm.reportYear, onClick = { vm.pickReportYear(false) }, label = { Text("Denne måneden") })
                FilterChip(selected = vm.reportYear, onClick = { vm.pickReportYear(true) }, label = { Text("Hittil i år") })
            }
        }
        vm.moduleError?.let { e -> item { Empty(e) } }
        if (r == null && vm.moduleError == null) item { Loading() }
        if (r != null) {
            val cur = LocalDate.now().toString().substring(0, 7)
            val inn = if (vm.reportYear) r.months.sumOf { it.inn } else r.months.firstOrNull { it.month == cur }?.inn ?: r.months.firstOrNull()?.inn ?: 0.0
            val ut = if (vm.reportYear) r.months.sumOf { it.ut } else r.months.firstOrNull { it.month == cur }?.ut ?: r.total
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Kpi("Inn", kr(inn), Modifier.weight(1f), RoundedCornerShape(28.dp, 8.dp, 8.dp, 8.dp), fg = C.positive)
                        Kpi("Ut", kr(ut), Modifier.weight(1f), RoundedCornerShape(8.dp, 28.dp, 8.dp, 8.dp))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Kpi("Spart", kr(inn - ut), Modifier.weight(1f), RoundedCornerShape(8.dp, 8.dp, 8.dp, 28.dp), sub = "Inn − ut")
                        Kpi("Sparerate", if (inn > 0) "${((inn - ut) / inn * 100).toInt()} %" else "–", Modifier.weight(1f), RoundedCornerShape(8.dp, 8.dp, 28.dp, 8.dp), sub = "Av inntekt")
                    }
                }
            }
            if (r.byCategory.isNotEmpty()) item {
                val max = r.byCategory.maxOf { it.amount }.coerceAtLeast(1.0)
                Group("Per kategori") { r.byCategory.forEach { c -> BarRow(c.category, kr(c.amount), c.amount / max, Color(c.color)) } }
            }
            if (r.merchants.isNotEmpty()) item {
                Group("Topp butikker") {
                    r.merchants.forEachIndexed { i, m ->
                        ItemRow(vm, i, r.merchants.size, m.name, "${m.count} kjøp", "−${kr(m.amount)}", onClick = {
                            vm.openDetail(DetailInfo(m.name, "Topp butikk", "−${kr(m.amount)}", if (vm.reportYear) "Hittil i år" else "Denne måneden", listOf("Butikk" to listOf("Antall kjøp" to "${m.count}", "Brukt" to kr(m.amount))), m.name))
                        })
                    }
                }
            }
            if (r.months.isNotEmpty()) item {
                Group("Måned for måned") {
                    r.months.forEachIndexed { i, m ->
                        ItemRow(vm, i, r.months.size, monthLabel(m.month), "Spart ${kr(m.inn - m.ut)}", "+${n0(m.inn)}", C.positive,
                            trailing = { Text("−${n0(m.ut)}", fontFamily = Mono, fontSize = 13.sp, color = C.text2) },
                            onClick = {
                                vm.openDetail(DetailInfo("${monthLabel(m.month)} ${m.month.take(4)}", "Månedsrapport", kr(m.inn - m.ut), if (m.inn > 0) "Sparerate ${((m.inn - m.ut) / m.inn * 100).toInt()} %" else null,
                                    listOf("Sammendrag" to listOf("Inn" to kr(m.inn), "Ut" to kr(m.ut), "Spart" to kr(m.inn - m.ut)))))
                            })
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { vm.exportCsv() }, modifier = Modifier.weight(1f).height(52.dp), shape = RoundedCornerShape(26.dp)) { Text("Eksporter som CSV") }
                    OutlinedButton(onClick = { runCatching { uri.openUri(vm.base.trimEnd('/') + "/finans/?desktop=1#/rap") } }, modifier = Modifier.weight(1f).height(52.dp), shape = RoundedCornerShape(26.dp)) { Text("PDF-rapport") }
                }
            }
        }
    }
}

/* ---------------- Import ---------------- */

@Composable
internal fun ImportScreen(vm: AppViewModel) {
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris -> if (uris.isNotEmpty()) { vm.importUris = uris; vm.importResult = null } }
    val r = vm.importResult
    Page {
        item { ModuleHeader(vm, "Import") }
        item { SubText("Kontoutskrift som CSV, XLSX eller innlimt tekst. DNB-format renses automatisk.") }
        item {
            OutlinedButton(onClick = { pick.launch(arrayOf("text/csv", "text/comma-separated-values", "text/plain", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "*/*")) },
                modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp)) {
                Icon(Icons.Filled.FolderOpen, null); Spacer(Modifier.width(8.dp)); Text(if (vm.importUris.isEmpty()) "Velg filer (.xlsx, .csv, .txt)" else "${vm.importUris.size} fil(er) valgt")
            }
        }
        item {
            OutlinedTextField(vm.importText, { vm.importText = it; vm.importResult = null }, label = { Text("…eller lim inn tekst fra nettbanken") }, minLines = 4, maxLines = 10,
                modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp))
        }
        item { PrimaryButton("Forhåndsvis", vm.importUris.isNotEmpty() || vm.importText.isNotBlank()) { vm.runImport(false) } }
        if (r != null) {
            r.errors.forEach { e -> item { Text(e, color = C.accentLight, fontSize = 13.sp, modifier = Modifier.padding(start = 8.dp)) } }
            item { SubText("${r.rows.size} poster${if (r.skipped > 0) " · ${r.skipped} hoppet over" else ""}${r.rows.count { it.duplicate }.takeIf { it > 0 }?.let { " · $it finnes fra før" } ?: ""}") }
            item {
                Group("Forhåndsvisning") {
                    val rows = r.rows.take(200)
                    rows.forEachIndexed { i, row ->
                        ItemRow(vm, i, rows.size, row.description, listOfNotNull(ddmm(row.date), row.category, row.raw?.takeIf { it != row.description }, if (row.duplicate) "finnes fra før" else null).joinToString(" · "),
                            signed(row.amount), if (row.amount > 0) C.positive else C.text, domain = row.domain, ai = row.aiShort, onClick = null)
                    }
                }
            }
            val n = r.rows.count { !it.duplicate }
            item { PrimaryButton("Importer $n poster", n > 0) { vm.runImport(true) } }
        }
    }
}

/* ---------------- Detaljside ---------------- */

@Composable
internal fun DetailScreen(vm: AppViewModel, d: DetailInfo) {
    Page {
        item { ModuleHeader(vm, d.title, back = { vm.back() }) }
        d.sub?.let { item { SubText(it) } }
        if (d.value != null) item { PageHero(d.sub ?: d.title, d.value, d.valueSub) }
        d.groups.forEach { (title, rows) ->
            if (rows.isNotEmpty()) item {
                Group(title) {
                    rows.forEachIndexed { i, (k, v) ->
                        Row(Modifier.fillMaxWidth().clip(itemShape(i, rows.size)).background(C.surface1).padding(16.dp, 14.dp)) {
                            Text(k, color = C.text2, modifier = Modifier.weight(1f)); Text(v, fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }
        }
        if (d.txQuery != null) {
            item { SectionLabel("Transaksjoner") }
            val list = vm.detailTx
            if (list == null) item { Loading() }
            else if (list.isEmpty()) item { Empty("Ingen transaksjoner funnet.") }
            else item {
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    list.forEachIndexed { i, t -> TxRow(vm, t, itemShape(i, list.size)) { val id = t.id; vm.detail = null; vm.showTx(id) } }
                }
            }
        }
    }
}

/* ---------------- Legg til / rediger transaksjon ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TxEditScreen(vm: AppViewModel, draft: TxDraft, scan: ScanActions) {
    var d by remember(draft.id) { mutableStateOf(draft) }
    var confirm by remember { mutableStateOf(false) }
    val cats = vm.boot?.categories?.filter { if (d.income) it.kind == "income" || it.kind == "transfer" else it.kind != "income" }.orEmpty().ifEmpty { vm.boot?.categories.orEmpty() }
    val chipColors = FilterChipDefaults.filterChipColors(selectedContainerColor = C.container, selectedLabelColor = C.onContainer)
    Page {
        item { ModuleHeader(vm, if (d.id != null) "Rediger transaksjon" else "Ny transaksjon", back = { vm.editing = null }) }
        item {
            Group(null) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = !d.income, onClick = { d = d.copy(income = false) }, label = { Text("Utgift") }, colors = chipColors)
                    FilterChip(selected = d.income, onClick = { d = d.copy(income = true) }, label = { Text("Inntekt") }, colors = chipColors)
                }
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(d.description, { d = d.copy(description = it) }, label = { Text("Beskrivelse") }, placeholder = { Text("f.eks. REMA 1000") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp))
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(d.amount, { d = d.copy(amount = it) }, label = { Text("Beløp (kr)") }, placeholder = { Text("0,00") }, singleLine = true, modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), shape = RoundedCornerShape(16.dp))
                    OutlinedTextField(d.date, { d = d.copy(date = it) }, label = { Text("Dato (ÅÅÅÅ-MM-DD)") }, singleLine = true, modifier = Modifier.weight(1f), shape = RoundedCornerShape(16.dp))
                }
            }
        }
        item {
            Group("Kategori") {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    cats.forEach { c -> FilterChip(selected = d.categoryId == c.id, onClick = { d = d.copy(categoryId = c.id) }, label = { Text(c.name) }, colors = chipColors) }
                }
            }
        }
        item {
            Group("Konto") {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    vm.boot?.accounts?.forEach { a -> FilterChip(selected = d.accountId == a.id, onClick = { d = d.copy(accountId = a.id) }, label = { Text(a.name) }, colors = chipColors) }
                }
            }
        }
        item {
            Group("Kvittering") {
                Text(when (d.receipt) { "booked" -> "Vedlagt"; null -> "Ingen kvittering"; else -> "Til gjennomgang" }, color = C.text2, modifier = Modifier.padding(start = 8.dp, bottom = 4.dp))
                OutlinedButton(onClick = { scan.sheet() }, shape = RoundedCornerShape(20.dp)) { Icon(Icons.Filled.AttachFile, null); Spacer(Modifier.width(6.dp)); Text("Legg ved kvittering") }
                Text("Kvitteringen legges i opplastingskøen og kobles til transaksjonen når den bokføres (samme beløp og dato).", color = C.text2, fontSize = 12.sp, modifier = Modifier.padding(start = 8.dp, top = 4.dp))
            }
        }
        item {
            Group("Bolig") {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = d.folderId == null, onClick = { d = d.copy(folderId = null) }, label = { Text("Ingen") }, colors = chipColors)
                    vm.folders?.forEach { f -> FilterChip(selected = d.folderId == f.id, onClick = { d = d.copy(folderId = f.id) }, label = { Text(f.name) }, colors = chipColors) }
                }
                Text("Utgiften vises også i boligen og fordeles på medlemmene.", color = C.text2, fontSize = 12.sp, modifier = Modifier.padding(start = 8.dp, top = 4.dp))
            }
        }
        item {
            Group("Notat") {
                OutlinedTextField(d.note, { d = d.copy(note = it) }, placeholder = { Text("Valgfritt") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp), minLines = 2)
            }
        }
        item { PrimaryButton(if (d.id != null) "Lagre endringer" else "Legg til", !vm.busy) { vm.saveTx(d) } }
        if (d.id != null) item {
            OutlinedButton(onClick = { confirm = true }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp)) { Text("Slett transaksjon", color = C.red) }
        }
    }
    if (confirm) AlertDialog(onDismissRequest = { confirm = false }, title = { Text("Slette transaksjonen?") }, text = { Text("Den forsvinner fra liste, rapporter, budsjett og AI-søk.") },
        confirmButton = { TextButton(onClick = { confirm = false; d.id?.let(vm::deleteTx) }) { Text("Slett", color = C.red) } },
        dismissButton = { TextButton(onClick = { confirm = false }) { Text("Avbryt") } })
}

/* ---------------- Original kvittering og banktransaksjon ---------------- */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun OriginalScreen(vm: AppViewModel) {
    val o = vm.original ?: return
    val ctx = LocalContext.current
    var data by remember(o) { mutableStateOf<ByteArray?>(null) }
    var pages by remember(o) { mutableStateOf<List<Bitmap>>(emptyList()) }
    val receipt = o.receipt
    val pdf = receipt?.mime?.contains("pdf") == true
    LaunchedEffect(o) {
        val path = receipt?.fileUrl ?: return@LaunchedEffect
        val b = vm.bytes(path) ?: return@LaunchedEffect
        data = b
        pages = withContext(Dispatchers.IO) {
            if (pdf) renderPdf(File(ctx.cacheDir, "original.pdf").apply { writeBytes(b) })
            else listOfNotNull(BitmapFactory.decodeByteArray(b, 0, b.size))
        }
    }
    val bank = vm.originalTab == "bank"
    val name = if (bank) "banktransaksjon.json" else if (pdf) "kvittering.pdf" else "kvittering.jpg"
    val mime = if (bank) "application/json" else receipt?.mime ?: "image/jpeg"
    val bytes: ByteArray? = if (bank) o.bankRow?.json?.toByteArray() else data
    val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(mime)) { uri -> if (uri != null) bytes?.let { vm.writeTo(uri, it) } }
    Column(Modifier.fillMaxSize().background(C.bg)) {
        Column(Modifier.padding(16.dp, 12.dp, 16.dp, 0.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            ModuleHeader(vm, if (bank) "Original banktransaksjon" else "Original kvittering", back = { vm.original = null })
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SegmentedButton(selected = !bank, onClick = { vm.originalTab = "receipt" }, shape = SegmentedButtonDefaults.itemShape(0, 2)) { Text("Kvittering") }
                SegmentedButton(selected = bank, onClick = { vm.originalTab = "bank" }, shape = SegmentedButtonDefaults.itemShape(1, 2)) { Text("Banktransaksjon") }
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth().padding(16.dp)) {
            if (!bank) {
                when {
                    receipt == null -> NoOriginal("Ingen kvittering vedlagt", "Legg ved en kvittering fra Skann, så kobles den når den bokføres.")
                    pages.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) }
                    else -> Zoomable(pages)
                }
            } else {
                val b = o.bankRow
                if (b == null) NoOriginal("Ingen bankrad lagret", "Transaksjonen ble lagt inn manuelt eller fra en kvittering, ikke importert fra banken.")
                else Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    val rows = listOfNotNull(
                        "Dato" to ddmmyyyy(b.bookingDate), "Rentedato" to ddmmyyyy(b.valueDate), b.description?.let { "Forklaring" to it },
                        b.amount?.let { (if (it < 0) "Ut" else "Inn") to "${n2(kotlin.math.abs(it))} kr" }, b.account?.let { "Konto" to it },
                        b.source?.let { "Bank" to it }, b.archiveReference?.let { "Arkivref." to it },
                    )
                    rows.forEachIndexed { i, (k, v) ->
                        Row(Modifier.fillMaxWidth().clip(itemShape(i, rows.size)).background(C.surface1).padding(16.dp, 14.dp)) {
                            Text(k, color = C.text2, modifier = Modifier.weight(1f)); Text(v, fontWeight = FontWeight.Medium)
                        }
                    }
                    SectionLabel("Rådata")
                    Text(b.raw ?: b.json, fontFamily = Mono, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(C.surface1).horizontalScroll(rememberScrollState()).padding(14.dp))
                    Text("Teksten er bankens original, slik den var før navnevasking.", color = C.text2, fontSize = 12.sp, modifier = Modifier.padding(8.dp))
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(16.dp, 0.dp, 16.dp, 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { save.launch(name) }, enabled = bytes != null, modifier = Modifier.weight(1f).height(52.dp), shape = RoundedCornerShape(26.dp)) {
                Icon(Icons.Filled.Download, null); Spacer(Modifier.width(6.dp)); Text("Last ned")
            }
            Button(onClick = { bytes?.let { vm.shareFile(name, mime, it) } }, enabled = bytes != null, modifier = Modifier.weight(1f).height(52.dp), shape = RoundedCornerShape(26.dp),
                colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) {
                Icon(Icons.Filled.Share, null); Spacer(Modifier.width(6.dp)); Text("Del")
            }
        }
    }
}

@Composable
private fun NoOriginal(title: String, text: String) {
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterVertically)) {
        Icon(Icons.Filled.Receipt, null, tint = C.text2, modifier = Modifier.size(48.dp))
        Text(title, fontWeight = FontWeight.SemiBold)
        Text(text, color = C.text2, fontSize = 13.sp)
    }
}

/** Bilde eller PDF-sider med klyp for å zoome og dra for å flytte. */
@Composable
private fun Zoomable(pages: List<Bitmap>) {
    var scale by remember { mutableStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    val scroll = rememberScrollState()
    Box(Modifier.fillMaxSize().clip(RoundedCornerShape(20.dp)).background(Color.Black)
        .pointerInput(Unit) { detectTransformGestures { _, pan, zoom, _ -> scale = (scale * zoom).coerceIn(1f, 6f); offset = if (scale == 1f) Offset.Zero else offset + pan } }) {
        Column(Modifier.fillMaxSize().graphicsLayer { scaleX = scale; scaleY = scale; translationX = offset.x; translationY = offset.y }
            .then(if (scale == 1f) Modifier.verticalScroll(scroll) else Modifier), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            pages.forEach { p -> Image(p.asImageBitmap(), "Kvittering", contentScale = ContentScale.FillWidth, modifier = Modifier.fillMaxWidth()) }
        }
    }
}

private fun renderPdf(f: File): List<Bitmap> = runCatching {
    ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
        PdfRenderer(fd).use { r ->
            (0 until minOf(r.pageCount, 10)).map { i ->
                r.openPage(i).use { page ->
                    val w = 1200
                    val h = (w.toFloat() * page.height / page.width).toInt().coerceAtLeast(1)
                    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                    bmp.eraseColor(android.graphics.Color.WHITE)
                    page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    bmp
                }
            }
        }
    }
}.getOrDefault(emptyList())

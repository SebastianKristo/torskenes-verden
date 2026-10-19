package no.kristo.finanshub.ui

import androidx.compose.animation.core.FastOutSlowInEasing

import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Papir, prompt 14: Finans med egen fanelinje (Oversikt · Liste · Finn · Mer), Finn som rutenett,
 * Sporing med faner, varsler og kilder, kort som kan flyttes (langt trykk), innlogging og onboarding.
 */

/* ---------------- Felles byggeklosser ---------------- */

/** Pille-filter («Alle 7»): blekk når valgt, strek ellers. */
@Composable
internal fun PChip(text: String, on: Boolean, count: String? = null, onClick: () -> Unit) {
    val p = PaperPal.current
    Row(
        Modifier.height(34.dp).clip(CircleShape).background(if (on) p.ink else Color.Transparent)
            .border(1.dp, if (on) p.ink else p.line, CircleShape).clickable { Haptics.select(); onClick() }.padding(horizontal = 13.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(text, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1)
        if (count != null) Text(count, color = if (on) p.bg.copy(alpha = .7f) else p.mut, fontSize = 12.sp, fontFamily = PaperFonts.mono)
    }
}

/** Understreket felt (etikett i mono-aksent, verdi i serif), som i innloggingen og skjemaene i Papir. */
@Composable
internal fun PField(
    label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier, placeholder: String = "",
    keyboard: KeyboardOptions = KeyboardOptions.Default, password: Boolean = false, onDone: (() -> Unit)? = null,
) {
    val p = PaperPal.current
    var focused by remember { mutableStateOf(false) }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        PLabel(label, if (focused) p.lab else p.mut, 10.sp)
        BasicTextField(
            value, onChange, singleLine = true,
            textStyle = TextStyle(color = p.ink, fontSize = 18.sp, fontFamily = PaperFonts.serif),
            cursorBrush = SolidColor(p.lab),
            visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = keyboard,
            keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }, onGo = { onDone?.invoke() }),
            modifier = Modifier.fillMaxWidth().onFocusFlag { focused = it },
            decorationBox = { inner -> Box { if (value.isEmpty() && placeholder.isNotEmpty()) Text(placeholder, color = p.mut, fontSize = 18.sp, fontFamily = PaperFonts.serif); inner() } },
        )
        Box(Modifier.fillMaxWidth().height(if (focused) 2.dp else 1.dp).background(if (focused) p.lab else p.line))
    }
}

private fun Modifier.onFocusFlag(set: (Boolean) -> Unit): Modifier = this.onFocusChanged { set(it.isFocused) }

/**
 * Langt trykk (500 ms) uten å ta trykket fra knappene inni kortet: lytter i Initial-passet og gir opp
 * når fingeren slippes eller flyttes mer enn touch slop (rulling).
 */
internal fun Modifier.longPressEdit(enabled: Boolean, onLong: () -> Unit): Modifier = if (!enabled) this else this.pointerInput(Unit) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        val ended = withTimeoutOrNull(500L) {
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Initial)
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                if (!ch.pressed) break
                if ((ch.position - down.position).getDistance() > viewConfiguration.touchSlop) break
            }
            true
        }
        if (ended == null) onLong()
    }
}

/** Bryter i Papir-farger (42×24, grønn når på). */
@Composable
internal fun PToggle(title: String, sub: String?, on: Boolean, top: Boolean = false, onChange: (Boolean) -> Unit) {
    val p = PaperPal.current
    // Prompt 36: ikonbrikke i Innstillinger (SetIcons36), skillelinjen under teksten.
    val icons = setIconsOn36()
    Column {
        if (top) { if (icons) SetRule36() else Box(Modifier.fillMaxWidth().height(1.dp).background(p.line)) }
        Row(
            Modifier.fillMaxWidth().clickable { Haptics.select(); onChange(!on) }.padding(14.dp, 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (icons) SetChip36(title)
            Column(Modifier.weight(1f)) {
                Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                sub?.let { Text(it, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) }
            }
            Box(Modifier.size(42.dp, 24.dp).clip(CircleShape).background(if (on) p.pos else p.line).padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
                Box(Modifier.size(18.dp).clip(CircleShape).background(Color.White))
            }
        }
    }
}

/** Bilde fra serveren (krever token), lastet én gang per sti. */
@Composable
internal fun ServerImage(vm: AppViewModel, path: String?, modifier: Modifier, placeholder: @Composable BoxScope.() -> Unit = {}) {
    var bmp by remember(path) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(path) { if (!path.isNullOrBlank() && path.startsWith("/")) bmp = vm.image(path) }
    Box(modifier) {
        val b = bmp
        if (b != null) Image(b.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        else placeholder()
    }
}

private fun kr(v: Double) = "${n0(v)} kr"

/* ---------------- Finans → Mer ---------------- */

@Composable
internal fun PaperFinMore(vm: AppViewModel, navBottom: Dp) {
    val review = vm.boot?.reviewCount ?: vm.summary?.review?.size ?: 0
    val groups: List<Pair<String, List<Triple<String, String, () -> Unit>>>> = listOf(
        "Penger" to listOf(
            Triple("Budsjett", "Per kategori") { vm.openFromFinMer(Screen.Budget) },
            Triple("Kvitteringer", if (review > 0) "$review til gjennomgang" else "Kø og bokført") { vm.openFromFinMer(Screen.Scan) },
            Triple("Faste trekk", "Neste 30 dager") { vm.openFromFinMer(Screen.Fast) },
            Triple("Kontoer", "Saldo og sparemål") { vm.openFromFinMer(Screen.Accounts) },
        ),
        "Moduler" to listOf(
            Triple("Aksjer", "Trading 212") { vm.openFromFinMer(Screen.Stocks) },
            Triple("Abonnementer", "Subscription OS") { vm.openFromFinMer(Screen.Sub) },
            Triple("Boliger", "Utgifter, prosjekter og regninger") { vm.openFromFinMer(Screen.Folders) },
        ),
        "Data" to listOf(
            Triple("Import", "Bank, Excel og Finn") { vm.openFromFinMer(Screen.Import) },
            Triple("Rapporter", "Måned og år") { vm.openFromFinMer(Screen.Reports) },
            Triple("Innstillinger", "Tema, kategorier og regler") { vm.settingsPage = null; vm.openFromFinMer(Screen.Settings) },
        ),
    )
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        groups.forEach { (t, rows) ->
            item { PLabel(t, modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
            item {
                PCard(shadow = t == "Penger") {
                    rows.forEachIndexed { i, (n, sub, go) ->
                        val v = if (n == "Kvitteringer" && review > 0) "$review" else "›"
                        PRow(n, sub, v, if (v == "›") PaperPal.current.mut else PaperPal.current.lab, top = i > 0, onClick = go)
                    }
                }
            }
        }
    }
}

/* ---------------- Finans → Liste ---------------- */

@Composable
internal fun PaperList(vm: AppViewModel, navBottom: Dp) {
    val p = PaperPal.current
    var q by remember { mutableStateOf("") }
    var cat by remember { mutableStateOf("Alle") }
    val all = vm.txs ?: emptyList()
    val cats = remember(all) { all.groupBy { it.category }.entries.sortedByDescending { it.value.size }.map { it.key }.filter { it.isNotBlank() }.take(6) }
    val ql = q.trim().lowercase()
    val list = all.filter { t ->
        (cat == "Alle" || (cat == "Til gjennomgang" && t.receipt != null && t.receipt != "booked") || t.category == cat) &&
            (ql.isEmpty() || listOf(t.description, t.merchant ?: "", t.category, t.note, t.lines.joinToString(" ") { it.first }).joinToString(" ").lowercase().contains(ql) ||
                // Prompt 27: samme uklare matching som forslagene («blosm» finner Blomsterlandet).
                score27(t.merchant ?: t.description, ql) > 0)
    }
    val sum = list.sumOf { it.amount }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Row(
                Modifier.fillMaxWidth().height(46.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).padding(start = 16.dp, end = 5.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Prompt 27: ✕ til venstre når det står tekst (fokus beholdes).
                SearchLead27(q.isNotEmpty(), p.ink, p.mut, idle = { Text("⌕", color = p.mut, fontSize = 16.sp) }) { q = "" }
                BasicTextField(
                    q, { q = it }, singleLine = true,
                    textStyle = TextStyle(color = p.ink, fontSize = 14.5.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.lab),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), modifier = Modifier.weight(1f),
                    decorationBox = { inner -> Box { if (q.isEmpty()) Text("Søk i butikk, kategori eller varer", color = p.mut, fontSize = 14.5.sp); inner() } },
                )
                // ✦ AI: spørsmålet går til AI-søket.
                Box(
                    Modifier.height(36.dp).clip(CircleShape).background(p.ink).clickable { if (q.isNotBlank()) { vm.go(Screen.Search); vm.paperFin = true; vm.ask(q) } else vm.go(Screen.Search) }.padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("✦ AI", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 12.5.sp) }
            }
        }
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                (listOf("Alle", "Til gjennomgang") + cats).forEach { c -> PChip(c, cat == c) { cat = c } }
            }
        }
        item {
            Row(Modifier.fillMaxWidth().padding(top = 4.dp)) {
                PLabel((if (cat == "Alle") "Alle" else cat) + " · " + list.size, modifier = Modifier.weight(1f))
                Text("Netto ${signed(sum)} kr", color = if (sum >= 0) p.pos else p.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp)
            }
            Box(Modifier.fillMaxWidth().padding(top = 6.dp).height(2.dp).background(p.ink))
        }
        if (vm.txs == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
        else if (list.isEmpty()) item { Text("Ingen transaksjoner passer søket.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(8.dp)) }
        items(list.size) { i ->
            val t = list[i]
            val rc = when (t.receipt) { "booked" -> "kvittering"; null -> "ingen kvittering"; else -> "til gjennomgang" }
            Column {
                Row(Modifier.fillMaxWidth().clickable { vm.openTxHl30(t.id, q) }.padding(2.dp, 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Logo(vm, t.domain, t.merchant ?: t.description, t.color, 38, RoundedCornerShape(11.dp))
                    Column(Modifier.weight(1f)) {
                        Text(t.merchant ?: t.description, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${t.category} · ${ddmm(t.date)} · $rc", color = if (rc == "til gjennomgang") p.lab else p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    PSerif(signed(t.amount), 17.sp, if (t.amount > 0) p.pos else p.ink, maxLines = 1)
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            }
        }
    }
}

/* ---------------- Finans → Finn ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun PaperFinn(vm: AppViewModel, navBottom: Dp, wide: Boolean = false) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val data = vm.finn
    val all = data?.items ?: emptyList()
    val buy = all.filter { !it.sold }.sumOf { it.amount }
    val sell = all.filter { it.sold }.sumOf { it.amount }
    val net = sell - buy
    val mx = maxOf(1.0, buy, sell)
    val list = all.filter { finnSegMatch(vm.finnSeg, it) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            PCard(shadow = true) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        PLabel("Netto i år", modifier = Modifier.weight(1f))
                        Text("${all.size} handler", color = p.mut, fontSize = 12.sp)
                    }
                    PSerif((if (net >= 0) "+" else "−") + kr(kotlin.math.abs(net)), 40.sp, if (net >= 0) p.pos else p.lab, weight = FontWeight.Normal, maxLines = 1)
                    FinnBar("Kjøpt", all.count { !it.sold }, kr(buy), (buy / mx).toFloat(), p.ink)
                    FinnBar("Solgt", all.count { it.sold }, kr(sell), (sell / mx).toFloat(), p.pos)
                }
            }
        }
        // Handler som er underveis, mellom Netto i år og filterraden.
        item { FinnWayRow(vm, all) }
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FINN_SEGS.forEach { (k, n) -> PChip(n, vm.finnSeg == k, "${all.count { finnSegMatch(k, it) }}") { vm.finnSeg = k } }
            }
        }
        item {
            PButton(if (vm.finnAdding) "Lukk" else "+ Legg til kjøp eller salg", Modifier.fillMaxWidth(), kind = if (vm.finnAdding) "line" else "ink") { vm.finnAdding = !vm.finnAdding }
        }
        if (vm.finnAdding) item { FinnAddForm(vm) }
        vm.moduleError?.let { e -> item { Text(e, color = p.lab, fontSize = 13.sp) } }
        if (data == null && vm.moduleError == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
        else if (list.isEmpty()) item { Text("Ingen handler her ennå.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(6.dp)) }
        // Rutenett med to kort i bredden (3–4 på Fold).
        val cols = if (wide) 4 else 2
        val rows = list.chunked(cols)
        items(rows.size) { r ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                rows[r].forEach { d ->
                    // Prompt 23: trykk åpner annonsen i appen (FinnAd23), ikke på finn.no.
                    FinnCard(vm, d, Modifier.weight(1f)) { vm.openFinnAd23(d.id) }
                }
                repeat(cols - rows[r].size) { Spacer(Modifier.weight(1f)) }
            }
        }
        // Redigering under rutenettet (✎ på kortet).
        list.firstOrNull { it.id == vm.finnEdit }?.let { d -> item { FinnEditPanel(vm, d) } }
    }
}

@Composable
private fun FinnBar(label: String, n: Int, value: String, frac: Float, color: Color) {
    val p = PaperPal.current
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row {
            Text("$label · $n", color = p.mut, fontSize = 12.5.sp, modifier = Modifier.weight(1f))
            Text(value, color = p.ink, fontFamily = PaperFonts.mono, fontSize = 12.5.sp)
        }
        Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(p.line)) {
            Box(Modifier.fillMaxHeight().fillMaxWidth(frac.coerceIn(0.02f, 1f)).clip(RoundedCornerShape(4.dp)).background(color))
        }
    }
}

private val FINN_TINT = listOf(0xFF3A2F4A, 0xFF1E2A3F, 0xFF3B2E22, 0xFF22362C, 0xFF2C2C33, 0xFF2A3540)

@Composable
private fun FinnCard(vm: AppViewModel, d: FinnDeal, modifier: Modifier, open: () -> Unit) {
    val p = PaperPal.current
    val done = d.finished
    val edit = vm.finnEdit == d.id
    Column(
        modifier.clip(RoundedCornerShape(18.dp)).background(p.card).then(if (edit) Modifier.border(2.dp, p.lab, RoundedCornerShape(18.dp)) else Modifier).clickable(onClick = open),
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(1.15f).background(Color(FINN_TINT[d.id.mod(FINN_TINT.size)]))) {
            ServerImage(vm, d.image, Modifier.matchParentSize()) {
                Text(d.item.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1) }.uppercase(), color = Color.White.copy(alpha = .8f),
                    fontFamily = PaperFonts.serif, fontSize = 30.sp, modifier = Modifier.align(Alignment.Center))
            }
            val (pb, pf) = when { done -> Color(0x99000000) to Color.White; d.sold -> Color(0xFF2F7A4F) to Color.White; else -> Color(0xF0F3EFE6) to Color(0xFF1B1A17) }
            Box(Modifier.align(Alignment.TopStart).padding(8.dp).clip(CircleShape).background(pb).padding(8.dp, 3.dp)) {
                Text(d.status.uppercase(), color = pf, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.5.sp, maxLines = 1)
            }
            Box(
                Modifier.align(Alignment.TopEnd).padding(6.dp).size(30.dp).clip(CircleShape).background(Color(0xCC1B1A17))
                    .clickable { vm.finnEdit = if (edit) null else d.id },
                contentAlignment = Alignment.Center,
            ) { Text("✎", color = Color.White, fontSize = 14.sp) }
        }
        Column(Modifier.padding(10.dp, 9.dp, 10.dp, 11.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Row(Modifier.fillMaxWidth().height(3.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                (1..4).forEach { j ->
                    val c = when { done -> p.pos; j < d.level -> p.ink; j == d.level -> p.lab; else -> p.line }
                    Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(c))
                }
            }
            PSerif((if (d.sold) "+" else "−") + kr(d.amount), 17.sp, if (d.sold) p.pos else p.ink, maxLines = 1)
            Text(d.item, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, lineHeight = 16.sp)
            Text("${if (d.sold) "Solgt til" else "Kjøpt fra"} ${d.counterpart?.ifBlank { null } ?: "–"} · ${ddmm(d.date)}", color = p.mut, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(d.nextText, color = if (done) p.pos else p.lab, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun FinnAddForm(vm: AppViewModel) {
    val p = PaperPal.current
    var role by remember { mutableStateOf("bought") }
    var link by remember { mutableStateOf("") }
    var title by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }
    var who by remember { mutableStateOf("") }
    PCard {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                PChip("Kjøpt", role == "bought") { role = "bought" }
                PChip("Solgt", role == "sold") { role = "sold" }
            }
            PField("Finn-lenke (valgfritt)", link, { link = it }, placeholder = "finn.no/recommerce/forsale/item/…",
                keyboard = KeyboardOptions(keyboardType = KeyboardType.Uri, capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false))
            Text("✦ Med lenke henter AI tittel, pris, tekst og bilder fra annonsen.", color = p.mut, fontSize = 12.sp)
            PField("Tittel", title, { title = it })
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                PField("Pris (kr)", price, { price = it }, Modifier.weight(1f), keyboard = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                PField(if (role == "bought") "Selger" else "Kjøper", who, { who = it }, Modifier.weight(1f))
            }
            PButton("Lagre", Modifier.fillMaxWidth()) { vm.finnCreate(role, link, title, price, who) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FinnEditPanel(vm: AppViewModel, d: FinnDeal) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    var title by remember(d.id) { mutableStateOf(d.item) }
    var price by remember(d.id) { mutableStateOf(n0(d.amount).replace(" ", "")) }
    var who by remember(d.id) { mutableStateOf(d.counterpart ?: "") }
    var stage by remember(d.id) { mutableStateOf(d.level) }
    val receipts = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris -> if (uris.isNotEmpty()) vm.finnUploadFor(d.id, "receipts", uris) }
    val photos = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris -> if (uris.isNotEmpty()) vm.finnUploadFor(d.id, "photos", uris) }
    PCard(shadow = true) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PLabel("Rediger · ${if (d.sold) "salg" else "kjøp"}", modifier = Modifier.weight(1f))
                Text("Lukk", color = p.mut, fontSize = 13.sp, modifier = Modifier.clickable { vm.finnEdit = null })
            }
            PField("Tittel", title, { title = it })
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                PField("Pris (kr)", price, { price = it }, Modifier.weight(1f), keyboard = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                PField(if (d.sold) "Kjøper" else "Selger", who, { who = it }, Modifier.weight(1f))
            }
            PLabel("Status", p.mut, 10.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                d.points.forEachIndexed { i, n -> PChip(n, stage == i + 1) { stage = i + 1 } }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("Kvittering", Modifier.weight(1f), kind = "line", height = 42.dp) { receipts.launch(arrayOf("application/pdf", "image/*", "message/rfc822")) }
                PButton("Bilder", Modifier.weight(1f), kind = "line", height = 42.dp) { photos.launch(arrayOf("image/*")) }
                PButton("Annonse ↗", Modifier.weight(1f), kind = "line", height = 42.dp) {
                    openLink(ctx, d.adUrl ?: d.code?.takeIf { c -> c.all(Char::isDigit) }?.let { "https://www.finn.no/recommerce/forsale/item/$it" } ?: "https://www.finn.no/")
                }
            }
            if (vm.finnBusy != null) Text("Laster opp …", color = p.mut, fontSize = 12.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("Lagre", Modifier.weight(1f)) { vm.finnSave(d.id, title, price, who, stage) }
                PButton("Slett", Modifier.weight(1f), kind = "lab") { vm.finnDelete(d.id) }
            }
        }
    }
}

/* ---------------- Sporing ---------------- */

/** Et kort som kan flyttes: langt trykk (500 ms) gir redigeringsmodus, der kortene vugger og får ▲/▼. */
@Composable
internal fun ReorderCard(vm: AppViewModel, id: String, title: String, index: Int, count: Int, content: @Composable () -> Unit) {
    val p = PaperPal.current
    ReorderWrap(vm, id, title, index, count, p.ink, p.bg, content)
}

/** Felles for Papir og Klassisk: fargene på linja med ▲/▼ sendes inn. */
@Composable
internal fun ReorderWrap(vm: AppViewModel, id: String, title: String, index: Int, count: Int, barBg: Color, barFg: Color, content: @Composable () -> Unit) {
    val edit = vm.trkEdit
    val wob = rememberInfiniteTransition(label = "vugge")
    // Dempet vugging: ±0,2° med periode 0,6 s, annenhver i motsatt fase.
    val angle by wob.animateFloat(
        initialValue = if (index % 2 == 0) -0.2f else 0.2f, targetValue = if (index % 2 == 0) 0.2f else -0.2f,
        animationSpec = infiniteRepeatable(tween(300, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "vinkel",
    )
    Box(Modifier.fillMaxWidth().then(if (edit) Modifier.rotate(angle) else Modifier).longPressEdit(!edit) { Haptics.tap(); vm.trkEdit = true }) {
        Column {
            if (edit) Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp, 14.dp, 0.dp, 0.dp)).background(barBg).padding(start = 14.dp, end = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(title, color = barFg, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.weight(1f))
                TextButton(onClick = { vm.moveTrk(id, -1) }, enabled = index > 0) { Text("▲", color = if (index > 0) barFg else barFg.copy(alpha = .3f)) }
                TextButton(onClick = { vm.moveTrk(id, 1) }, enabled = index < count - 1) { Text("▼", color = if (index < count - 1) barFg else barFg.copy(alpha = .3f)) }
            }
            content()
        }
    }
}

/** «Ferdig»-linja øverst i redigeringsmodus. */
@Composable
internal fun ReorderDoneBar(vm: AppViewModel) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.lab).padding(14.dp, 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("Flytt kortene med ▲ og ▼", color = p.onLab, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
        Box(Modifier.clip(CircleShape).background(p.onLab).clickable { Haptics.success(); vm.trkEdit = false }.padding(14.dp, 6.dp)) {
            Text("Ferdig", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
    }
}

private val TRK_SECS = listOf(PSec("s1", "Faner"), PSec("s2", "Pakkelisten", hold = false), PSec("s3", "Legg til"), PSec("s4", "Varsler"), PSec("s5", "Transportører"))

@Composable
internal fun PaperTracking(vm: AppViewModel, navBottom: Dp) {
    val p = PaperPal.current
    val t = vm.tracking
    val items = t?.items ?: emptyList()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (t == null && vm.moduleError == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
        vm.moduleError?.let { e -> item { Text(e, color = p.lab, fontSize = 13.sp) } }
        // Hold inne på fanene, pakkelisten eller Legg til for å flytte eller skjule dem (lagres per bruker).
        pageSecs(vm, "sporing", TRK_SECS) { k ->
            when (k) {
                "s1" -> PCard {
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        TRK_TABS.forEach { (tk, n) ->
                            val on = vm.trkTab == tk
                            Row(
                                Modifier.height(34.dp).clip(CircleShape).background(if (on) p.ink else Color.Transparent).clickable { Haptics.select(); vm.trkTab = tk; vm.trkPickDone(); if (tk == "arkiv") vm.loadArchived() }.padding(horizontal = 12.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
                            ) {
                                Text(n, color = if (on) p.bg else p.mut, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1)
                                val cnt = if (tk == "arkiv") (vm.trkArchived?.size ?: items.count { it.archived }) else items.count { trkTabMatch(tk, it) }
                                Text("$cnt", color = if (on) p.bg.copy(alpha = .7f) else p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp)
                            }
                        }
                        Box(Modifier.size(34.dp).clip(CircleShape).clickable { vm.trkSettings = true }, contentAlignment = Alignment.Center) { Text("⚙", color = p.ink, fontSize = 16.sp) }
                    }
                }
                "s2" -> TrkShipments(vm, items)
                "s3" -> TrkAdd(vm, t)
                // Varslene er samlet i Innstillinger → Varsler; Sporing har bare en lenke dit.
                "s4" -> PCard(onClick = { vm.settingsPage = "notify"; vm.openPaperPage("set") }) {
                    Row(Modifier.padding(14.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text("Varsler for pakker", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
                            Text("Ligger i Innstillinger → Varsler", color = p.mut, fontSize = 12.5.sp)
                        }
                        Text("›", color = p.mut)
                    }
                }
                "s5" -> if (t != null) TrkCarriers(vm, t)
            }
        }
    }
}

@Composable
private fun TrkAdd(vm: AppViewModel, t: TrackingData?) {
    val p = PaperPal.current
    var no by remember { mutableStateOf("") }
    var pick by remember { mutableStateOf<String?>(null) }
    val guess = if (no.length >= 6) Carrier.detect(no) else null
    val car = guess?.let { g -> Carrier.KNOWN.firstOrNull { it.id == g } }
    val add = { if (no.length >= 6) { vm.addTracking26(no, pick); no = ""; pick = null } }
    PCard {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PLabel("Legg til sending")
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PField("Sporingsnummer", no, { no = it.uppercase() }, Modifier.weight(1f), placeholder = "CV704411234NO",
                    keyboard = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, autoCorrectEnabled = false, imeAction = ImeAction.Done),
                    onDone = { add() })
                PButton("Legg til", height = 42.dp) { add() }
            }
            CarrierChips26(no, pick) { pick = it }
            if (pick == null && car != null && car.id != "other") Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CarrierLogo(vm, car.id, car.name, car.ini, car.color, car.fg, 22)
                Text("Gjenkjent: ${car.name}", color = p.mut, fontSize = 12.5.sp)
            }
            if (t != null) {
                val src = listOfNotNull(
                    if (t.email.on) "E-post (Proton)" else null, if (t.finn.on) "Finn" else null,
                ).joinToString(" og ").ifBlank { "ingen kilder" }
                Text("Kilder: $src. Endre under ⚙.", color = p.mut, fontSize = 12.sp)
            }
        }
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun TrkShipments(vm: AppViewModel, items: List<Shipment>) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val arkiv = vm.trkTab == "arkiv"
    val src = if (arkiv) (vm.trkArchived ?: items.filter { it.archived }) else items
    val list = src.filter { trkTabMatch(vm.trkTab, it) }.sortedWith(compareByDescending<Shipment> { it.ready }.thenByDescending { it.step })
    // Prompt 22: trykk på en pakke viser tidslinjen med faktisk status; lenken til fraktselskapet ligger der.
    var expanded by remember { mutableStateOf<String?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Hold inne på en pakke for å velge flere, og arkiver, gjenopprett eller slett dem samlet.
        if (vm.trkPicking) TrkPickBar(vm, list.map { it.id }, arkiv)
        // Prompt 26: én pakke valgt → SPOR VIA (overstyr transportøren).
        if (vm.trkPicking && !arkiv) TrkSporVia26(vm, list)
        if (list.isEmpty()) PCard { Text(if (arkiv) "Ingen arkiverte sendinger." else "Ingen sendinger her.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp)) }
        list.forEach { s0 ->
            val s = vm.trkView26(s0)
            val picked = s.id in vm.trkPicked
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(if (picked) p.surf2 else p.card)
                    .then(if (picked) Modifier.border(2.dp, p.ink, RoundedCornerShape(18.dp)) else if (s.ready) Modifier.border(1.5.dp, p.lab, RoundedCornerShape(18.dp)) else Modifier)
                    .combinedClickable(
                        onClick = { if (vm.trkPicking) vm.trkPick(s.id) else { Haptics.select(); expanded = if (expanded == s.id) null else s.id } },
                        onLongClick = { Haptics.tap(); vm.trkPick(s.id) },
                    ).padding(14.dp, 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (vm.trkPicking) Box(Modifier.size(22.dp).clip(CircleShape).background(if (picked) p.ink else Color.Transparent).border(2.dp, if (picked) p.ink else p.mut, CircleShape), contentAlignment = Alignment.Center) {
                        if (picked) Text("✓", color = p.bg, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    // Prompt 21: butikklogo med fraktmerke (felles PackageLogo), tittel uten sporingsnummer.
                    PackageLogo(vm, s, 44)
                    Column(Modifier.weight(1f)) {
                        PSerif(s.cardTitle, 18.sp, maxLines = 1)
                        Text("${vm.trkCarrierLabel26(s)} · ${s.trackingNo}", color = p.mut, fontSize = 11.5.sp, fontFamily = PaperFonts.mono, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Text(s.sourceLabel, color = p.mut, fontSize = 11.sp)
                }
                Row(Modifier.fillMaxWidth().height(4.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    (0..4).forEach { j ->
                        val c = when { s.done -> p.pos; j < s.step -> p.ink; j == s.step -> p.lab; else -> p.line }
                        Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(c))
                    }
                }
                Row {
                    Text(trkStatusText(s), color = if (s.ready) p.lab else if (s.done) p.pos else if (s.updateError != null && s.status == "registered") p.mut else p.ink,
                        fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.weight(1f))
                    Text(trkEtaText(s), color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                TrkEventLines(s)
                if (expanded == s.id && !vm.trkPicking) TrkTimeline(s)
            }
        }
    }
}

@Composable
private fun TrkNotify(vm: AppViewModel, t: TrackingData) {
    PCard {
        Column {
            PLabel("Varsler", modifier = Modifier.padding(14.dp, 12.dp, 14.dp, 2.dp))
            PAPER_TRK_PREFS.forEachIndexed { i, (k, n, sub) -> PToggle(n, sub, t.prefs[k] ?: true, top = i > 0) { vm.setTrackingPref(k, it) } }
        }
    }
}

@Composable
private fun TrkCarriers(vm: AppViewModel, t: TrackingData) {
    val p = PaperPal.current
    PCard {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PLabel("Transportører")
            t.carriers.filter { it.id != "other" }.forEach { c ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CarrierLogo(vm, c.id, c.name, c.ini, c.color, c.fg, 26)
                    Text(c.name, color = p.ink, fontSize = 14.sp, modifier = Modifier.weight(1f))
                    Text(when (c.configured) { true -> "Koblet til"; false -> "Uten nøkkel"; null -> "" }, color = if (c.configured == true) p.pos else p.mut, fontSize = 12.sp)
                }
            }
        }
    }
}

private val PAPER_TRK_PREFS = listOf(
    Triple("found", "Ny pakke funnet", "Når et sporingsnummer dukker opp i e-post eller Finn"),
    Triple("pickup", "Klar for henting", "Med hentested og frist"),
    Triple("out", "Ute for levering", "Når budet er på vei til deg"),
    Triple("delayed", "Forsinket", "Når leveringen er forsinket"),
    Triple("delivered", "Levert", "Når pakken er levert"),
)

/** ⚙ «Varsler og kilder». Valgene lagres per bruker på serveren. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PaperTrackSettings(vm: AppViewModel) {
    val p = PaperPal.current
    val t = vm.tracking
    ModalBottomSheet(onDismissRequest = { vm.trkSettings = false }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp, 0.dp, 16.dp, 34.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PSerif("Varsler og kilder", 24.sp)
            if (t == null) Text("Sporing er ikke lastet ennå.", color = p.mut, fontSize = 13.sp)
            else {
                PLabel("Varsler", modifier = Modifier.padding(start = 4.dp, top = 6.dp))
                PCard { PAPER_TRK_PREFS.forEachIndexed { i, (k, n, sub) -> PToggle(n, sub, t.prefs[k] ?: true, top = i > 0) { vm.setTrackingPref(k, it) } } }
                PLabel("Kilder", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
                PCard {
                    PToggle("E-post (Proton Mail)", "Ordre- og fraktbekreftelser", t.email.on) { vm.setTrackingSource("email", it) }
                    PToggle("Finn", "Fiks ferdig-handler med sporingsnummer", t.finn.on, top = true) { vm.setTrackingSource("finn", it) }
                    PToggle("Arkiver leverte automatisk", "Etter 7 dager", t.autoArchive.on, top = true) { vm.setTrackingSource("autoArchive", it) }
                }
                Text("E-post leses via Proton Mail Bridge hvert 15. minutt. Finn-handler med Fiks ferdig hentes automatisk.", color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(4.dp))
            }
        }
    }
}

/* ---------------- Innlogging og onboarding i Papir ---------------- */

/** Fotoheader, understrekede felt (Server, Brukernavn, Passord), Logg inn, og 2FA-steget med sekssifret kode. */
@Composable
internal fun PaperLogin(vm: AppViewModel) {
    val p = PaperPal.current
    var server by remember { mutableStateOf(if (vm.addingAccount) "" else vm.server) }
    var user by remember { mutableStateOf("") }
    var pw by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var trust by remember { mutableStateOf(true) }
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(vm.message) { vm.message?.let { snack.showSnackbar(it); vm.message = null } }
    val pend = vm.pending
    Box(Modifier.fillMaxSize().background(p.bg)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding()) {
            GateHero(if (pend != null) "Homelab · ${pend.server.substringAfter("://")}" else "Homelab", if (pend != null) "Totrinns-\nbekreftelse" else "${greetingFor()},\nvelkommen hjem")
            Column(Modifier.widthIn(max = 520.dp).fillMaxWidth().padding(26.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                if (pend == null) {
                    PField("Server", server, { server = it }, placeholder = "home.dittdomene.no", keyboard = ServerKeyboard)
                    PField("Brukernavn", user, { user = it }, keyboard = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Next))
                    PField("Passord", pw, { pw = it }, password = true, keyboard = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                        onDone = { if (server.isNotBlank() && pw.isNotBlank()) vm.login(server, user, pw) })
                    PButton(if (vm.busy) "Logger inn …" else "Logg inn", Modifier.fillMaxWidth(), height = 54.dp) { if (server.isNotBlank() && pw.isNotBlank() && !vm.busy) vm.login(server, user, pw) }
                    Text("Face ID / fingeravtrykk kan slås på etter innlogging, under Innstillinger → Sikkerhet.", color = p.mut, fontSize = 12.sp)
                    if (vm.addingAccount) Text("‹ Avbryt", color = p.lab, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { vm.addingAccount = false })
                    else Text("Bytt til Klassisk innlogging", color = p.mut, fontSize = 12.5.sp, modifier = Modifier.clickable { vm.setMobileDesign("klassisk") })
                } else {
                    Text("Skriv inn den sekssifrede koden fra autentiseringsappen for ${pend.username.ifBlank { "kontoen" }}.", color = p.mut, fontSize = 14.sp)
                    PField("Kode", code, { v -> code = v.filter { it.isLetterOrDigit() || it == '-' }.take(11) },
                        keyboard = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
                        onDone = { if (code.length >= 6) vm.login(pend.server, pend.username, pend.password, code) })
                    PToggle("Husk denne enheten i 30 dager", "På lokalt nett hoppes passordet over med en gyldig enhet", trust) { trust = it }
                    PButton(if (vm.busy) "Bekrefter …" else "Bekreft", Modifier.fillMaxWidth(), height = 54.dp) { if (code.length >= 6 && !vm.busy) vm.login(pend.server, pend.username, pend.password, code) }
                    Text("‹ Tilbake", color = p.lab, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { vm.cancelTotp(); code = "" })
                    Text("Har du mistet telefonen, kan du bruke en gjenopprettingskode.", color = p.mut, fontSize = 12.sp)
                }
            }
        }
        SnackbarHost(snack, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 16.dp))
    }
}

@Composable
private fun GateHero(kicker: String, title: String) {
    val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    Box(
        Modifier.fillMaxWidth().height(260.dp + statusTop)
            .background(Brush.linearGradient(listOf(Color(0xFF5D7690), Color(0xFF2A3440), Color(0xFF1D242C)))),
    ) {
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(0f to Color.Black.copy(alpha = .25f), .35f to Color.Transparent, 1f to Color.Black.copy(alpha = .45f))))
        Column(Modifier.align(Alignment.BottomStart).padding(26.dp, 0.dp, 26.dp, 28.dp)) {
            PSerif(kicker, 17.sp, Color.White.copy(alpha = .9f), italic = true, weight = FontWeight.Normal, maxLines = 1)
            Spacer(Modifier.height(4.dp))
            AutoSerif(title, 42.sp, Color.White, min = 24.sp)
        }
    }
}

/** Onboarding i 3 steg første gang etter innlogging: design, bakgrunn, og varsler og tilgang. Alt kan endres senere. */
@Composable
internal fun PaperOnboarding(vm: AppViewModel) {
    val p = PaperPal.current
    var step by remember { mutableStateOf(0) }
    val ctx = LocalContext.current
    var notif by remember { mutableStateOf(Notify.allowed(ctx)) }
    val askNotif = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> notif = ok }
    val first = vm.displayName.split(' ').firstOrNull().orEmpty().ifBlank { "du" }
    val (access, finishAccess) = rememberOnboardFinish(vm)
    Box(Modifier.fillMaxSize().background(p.bg)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            GateHero("Steg ${step + 1} av 3", listOf("Velkommen,\n$first", "Velg bakgrunn", "Nesten ferdig")[step])
            Column(Modifier.fillMaxWidth().padding(22.dp, 20.dp, 22.dp, 40.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    (0..2).forEach { i -> Box(Modifier.size(if (i == step) 22.dp else 8.dp, 8.dp).clip(CircleShape).background(if (i <= step) p.ink else p.line)) }
                }
                when (step) {
                    0 -> {
                        Text("Velg designet appen skal ha. Du kan bytte under Innstillinger → Utseende.", color = p.mut, fontSize = 14.sp)
                        val cur = if (!vm.paper) "klassisk" else if (vm.paperMode == "mork") "mork" else "lys"
                        listOf(
                            Triple("lys", "Papir · lys", "Lyst papir, avisspalter og svart fanelinje."),
                            Triple("mork", "Papir · mørk", "Kveldspapir med lys fanelinje."),
                            Triple("klassisk", "Klassisk", "Material You, som appen så ut før."),
                        ).forEach { (k, n, sub) ->
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).border(2.dp, if (cur == k) p.ink else Color.Transparent, RoundedCornerShape(18.dp))
                                    .clickable {
                                        Haptics.select()
                                        if (k == "klassisk") vm.setMobileDesign("klassisk") else { vm.setMobileDesign("papir"); vm.setPaperMode(k) }
                                    }.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                val sw = when (k) {
                                    "lys" -> Brush.verticalGradient(0f to Color(0xFF5D7690), .4f to Color(0xFF5D7690), .4f to Color(0xFFF3EFE6), 1f to Color(0xFFF3EFE6))
                                    "mork" -> Brush.verticalGradient(0f to Color(0xFF2A3440), .4f to Color(0xFF2A3440), .4f to Color(0xFF14130F), 1f to Color(0xFF14130F))
                                    else -> Brush.linearGradient(listOf(Color(0xFF3B6FD6), Color(0xFF6B3FB5)))
                                }
                                Box(Modifier.size(54.dp, 72.dp).clip(RoundedCornerShape(10.dp)).background(sw))
                                Column(Modifier.weight(1f)) {
                                    PSerif(n, 20.sp, maxLines = 1)
                                    Text(sub, color = p.mut, fontSize = 12.5.sp)
                                }
                                if (cur == k) Text("✓", color = p.ink, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                    1 -> {
                        Text("Bildet øverst på Hjem. Du kan bytte det med pillen i fotovinduet.", color = p.mut, fontSize = 14.sp)
                        LaunchedEffect(Unit) { vm.loadPhotoThumbs() }
                        listOf("cur" to "Nåværende", "oslo" to "Oslo", "weather" to "Vær nå", "planets" to "Planeter").chunked(2).forEach { row ->
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                row.forEach { (k, n) ->
                                    Column(
                                        Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(p.card)
                                            .border(2.dp, if (vm.photoKind == k) p.ink else Color.Transparent, RoundedCornerShape(16.dp)).clickable { vm.setPhotoKind(k) },
                                    ) {
                                        Box(Modifier.fillMaxWidth().height(90.dp).background(Brush.linearGradient(listOf(Color(0xFF4A5A6A), Color(0xFF1D242C))))) {
                                            vm.photoThumbs[k]?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
                                        }
                                        Text(n, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, modifier = Modifier.padding(10.dp))
                                    }
                                }
                            }
                        }
                    }
                    else -> {
                        Text("Gi tilgang til det du vil bruke. Alt kan endres senere.", color = p.mut, fontSize = 14.sp)
                        PCard {
                            PToggle("Varsler", "Pakker, frister og kvitteringer", notif) { on ->
                                if (on && android.os.Build.VERSION.SDK_INT >= 33) askNotif.launch(android.Manifest.permission.POST_NOTIFICATIONS) else notif = on
                            }
                            PToggle("Kamera", "For å skanne kvitteringer og oppskrifter (systemets kamera-app)", true, top = true) { }
                            PToggle("Fingeravtrykk / ansikt", "Lås opp uten passord", vm.flag(AppPrefs.LOCK), top = true) { vm.setPref(AppPrefs.LOCK, it) }
                            PToggle("Haptisk tilbakemelding", "Små vibrasjoner ved trykk", vm.flag(Haptics.ON, true), top = true) { vm.setPref(Haptics.ON, it) }
                            OnboardAccessRows(access)
                        }
                        Text("«Logg ut» ligger under Innstillinger → Konto.", color = p.mut, fontSize = 12.sp)
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 8.dp)) {
                    if (step > 0) PButton("Tilbake", Modifier.weight(1f), kind = "line", height = 52.dp) { step-- }
                    PButton(if (step < 2) "Neste" else "Ferdig", Modifier.weight(1f), height = 52.dp) { if (step < 2) step++ else { Haptics.success(); finishAccess() } }
                }
            }
        }
    }
}

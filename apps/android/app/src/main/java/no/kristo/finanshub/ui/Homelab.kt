package no.kristo.finanshub.ui

import android.graphics.Bitmap
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import java.time.LocalTime
import java.time.format.DateTimeFormatter

/** Widgets på forsiden: navn, beskrivelse og ikon (galleriet «Legg til widget»). */
private val WIDGETS: Map<String, Triple<String, String, ImageVector>> = mapOf(
    "clock" to Triple("Klokke og vær", "Tid, været og pakker på vei (sveip)", Icons.Filled.Schedule),
    "search" to Triple("Google-søk", "Søk med forslag og historikk", Icons.Filled.Search),
    "links" to Triple("Snarveier", "Favorittsider og tjenester på hjemmenettet", Icons.Filled.Apps),
    "os" to Triple("Andre OS", "Finans, Domener og Mat", Icons.Filled.Widgets),
    "srv" to Triple("Serverstatus", "CPU, minne, lagring og oppetid", Icons.Filled.Dns),
    "ruter" to Triple("Ruter-avganger", "Neste avganger fra holdeplassen", Icons.Filled.DirectionsBus),
)
private val HL_NAMES = mapOf("hl" to "Homelab", "home" to "Finans", "trk" to "Sporing", "dom" to "Domener", "mat" to "Mat")
private val FIN_NAMES = mapOf("home" to "Oversikt", "list" to "Liste", "finn" to "Finn", "bud" to "Budsjett", "ai" to "Søk", "mer" to "Mer")

private fun greeting(): String = when (LocalTime.now().hour) { in 5..9 -> "God morgen"; in 10..17 -> "Hei"; else -> "God kveld" }

/**
 * Homelab-forsiden på mobil: hilsen, klokke og vær, Google-søk, snarveier, Andre OS og valgfrie widgets.
 * «Rediger forsiden» gjør den om til en hjemskjerm som vugger, med − for å skjule, ▲▼ for å flytte og + for å legge til.
 */
@Composable
internal fun HomelabScreen(vm: AppViewModel, twoPane: Boolean) {
    val h = vm.mobileHome
    val edit = vm.editHome
    val sections = vm.layout.sec.filter { vm.layout.visible(it) }
    Page {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(longDate(), color = C.text2, fontSize = 13.sp)
                    // Alltid to linjer: «God kveld,» over navnet.
                    Text("${h?.greeting ?: greeting()},", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis, lineHeight = 34.sp)
                    Text(vm.displayName.ifBlank { "du" }, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis, lineHeight = 34.sp)
                }
                if (edit) {
                    FilledTonalIconButton(onClick = { vm.widgetGallery = true }) { Icon(Icons.Filled.Add, "Legg til widget") }
                    Spacer(Modifier.width(6.dp))
                    Button(onClick = { vm.editHome = false }, colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text("Ferdig", fontWeight = FontWeight.Bold) }
                } else Avatar(vm)
            }
        }
        vm.homeError?.let { e -> item { Text(e, color = C.text2, fontSize = 13.sp, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(C.surface1).padding(14.dp)) } }
        if (sections.isEmpty()) item { Empty(if (edit) "Alle widgets er skjult. Trykk + for å legge til." else "Forsiden er tom. Rediger forsiden fra menyen.") }
        sections.forEachIndexed { i, id ->
            item(key = id) {
                EditFrame(vm, id, i, sections.size) {
                    when (id) {
                        "clock" -> HomeCarousel(vm)
                        "search" -> GoogleSearch(vm)
                        "links" -> Shortcuts(vm)
                        "os" -> OtherOs(vm, twoPane)
                        "srv" -> ServerCard(h?.serverStatus)
                        "ruter" -> RuterCard(h?.ruter ?: emptyList())
                        else -> {}
                    }
                }
            }
        }
        if (edit) item {
            Text("Trykk − for å skjule, ▲▼ for å flytte og + for å legge til widgets og endre fanelinjene. Oppsettet lagres for denne brukeren på denne enheten.",
                color = C.text2, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 8.dp))
        }
    }
}

/** Ramme rundt en widget i redigeringsmodus: vugger, stiplet kant, − oppe til venstre og ▲▼ oppe til høyre. */
@Composable
private fun EditFrame(vm: AppViewModel, id: String, index: Int, n: Int, content: @Composable () -> Unit) {
    if (!vm.editHome) { content(); return }
    val t = rememberInfiniteTransition(label = "vugg")
    val a by t.animateFloat(-0.5f, 0.5f, infiniteRepeatable(tween(320), RepeatMode.Reverse), label = "vinkel")
    val angle = if (index % 2 == 0) a else -a
    val dash = C.outline
    Box(Modifier.fillMaxWidth().padding(top = 6.dp)) {
        Box(
            Modifier.fillMaxWidth().graphicsLayer { rotationZ = angle }
                .drawWithContent {
                    drawContent()
                    drawRoundRect(dash, cornerRadius = CornerRadius(28.dp.toPx()), style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(14f, 10f))))
                },
        ) {
            content()
            // Gjennomsiktig lag som blokkerer trykk på innholdet mens man redigerer.
            Box(Modifier.matchParentSize().clickable(remember { MutableInteractionSource() }, null) {})
        }
        Box(Modifier.align(Alignment.TopStart).offset((-6).dp, (-6).dp).size(30.dp).clip(CircleShape).background(C.red).clickable { vm.setHidden(id, true) }, contentAlignment = Alignment.Center) {
            Text("−", color = tc(0xFF3A0B07), fontWeight = FontWeight.Bold, fontSize = 18.sp)
        }
        Row(Modifier.align(Alignment.TopEnd).offset(6.dp, (-6).dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            SmallRound("▲", enabled = index > 0) { vm.move("sec", id, -1) }
            SmallRound("▼", enabled = index < n - 1) { vm.move("sec", id, 1) }
        }
    }
}

@Composable
private fun SmallRound(text: String, enabled: Boolean, onClick: () -> Unit) {
    Box(Modifier.size(30.dp).clip(CircleShape).background(if (enabled) C.surface3 else C.surface2).clickable(enabled = enabled, onClick = onClick), contentAlignment = Alignment.Center) {
        Text(text, color = if (enabled) C.text else C.text2.copy(alpha = .4f), fontSize = 12.sp)
    }
}

/* ---------------- Seksjonene ---------------- */

@Composable
private fun HCard(content: @Composable ColumnScope.() -> Unit) =
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(C.surface1).padding(18.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)

/** Google-søk med nylige søk og forslag i en liste rett under feltet. Adresser åpnes direkte. */
@Composable
private fun GoogleSearch(vm: AppViewModel) {
    val uri = LocalUriHandler.current
    val focus = LocalFocusManager.current
    var text by remember { mutableStateOf("") }
    var focused by remember { mutableStateOf(false) }
    fun go(q: String) {
        if (q.isBlank()) return
        val url = vm.googleUrl(q)
        text = ""; focus.clearFocus()
        runCatching { uri.openUri(url) }
    }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        TextField(
            value = text, onValueChange = { text = it; vm.suggest(it) }, placeholder = { Text("Søk på Google eller skriv en adresse") },
            leadingIcon = { Text("G", fontWeight = FontWeight.Bold, fontSize = 20.sp, color = tc(0xFF4285F4)) },
            trailingIcon = { if (text.isNotEmpty()) IconButton(onClick = { text = ""; vm.suggest("") }) { Icon(Icons.Filled.Close, "Tøm") } },
            singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Search, autoCorrectEnabled = false),
            keyboardActions = KeyboardActions(onSearch = { go(text) }),
            shape = RoundedCornerShape(28.dp), modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).onFocusChanged { focused = it.isFocused },
            colors = TextFieldDefaults.colors(focusedContainerColor = C.surface2, unfocusedContainerColor = C.surface2, focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent),
        )
        if (focused) {
            val list = if (text.isBlank()) vm.history.take(8) else vm.suggestions
            if (list.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(C.surface2).padding(vertical = 6.dp)) {
                if (text.isBlank()) Row(Modifier.fillMaxWidth().padding(16.dp, 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Nylige søk", color = C.text2, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text("Tøm historikk", color = C.primary, fontSize = 12.sp, modifier = Modifier.clickable { vm.clearHistory() })
                }
                list.forEach { q ->
                    Row(Modifier.fillMaxWidth().clickable { go(q) }.padding(16.dp, 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Icon(if (text.isBlank()) Icons.Filled.History else Icons.Filled.Search, null, tint = C.text2, modifier = Modifier.size(18.dp))
                        Text(q, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (text.isBlank()) Icon(Icons.Filled.Close, "Fjern", tint = C.text2, modifier = Modifier.size(18.dp).clickable { vm.removeHistory(q) })
                    }
                }
            }
        }
    }
}

@Composable
private fun Shortcuts(vm: AppViewModel) {
    val uri = LocalUriHandler.current
    val list = vm.mobileHome?.shortcuts ?: emptyList()
    HCard {
        Text("Snarveier", fontWeight = FontWeight.Bold)
        if (list.isEmpty()) Text("Ingen snarveier. Legg dem inn i Homelab på PC.", color = C.text2, fontSize = 13.sp)
        list.chunked(4).forEach { row ->
            Row(Modifier.fillMaxWidth()) {
                row.forEach { s ->
                    Column(Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).clickable { runCatching { uri.openUri(s.url) } }.padding(vertical = 6.dp),
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        ShortcutIcon(vm, s)
                        Text(s.name, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/** Favicon (via Googles favicon-tjeneste) for adresser på nett, initial for adresser på lokalnettet. */
@Composable
private fun ShortcutIcon(vm: AppViewModel, s: Shortcut) {
    var bmp by remember(s.url) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(s.url) { if (!s.local) bmp = vm.favicon(s.url) }
    val b = bmp
    Box(Modifier.size(56.dp).clip(RoundedCornerShape(18.dp)).background(if (b != null) Color.White else C.container), contentAlignment = Alignment.Center) {
        if (b != null) Image(b.asImageBitmap(), null, contentScale = ContentScale.Fit, modifier = Modifier.size(32.dp))
        else Text(initial(s.name), color = C.onContainer, fontWeight = FontWeight.Bold, fontSize = 20.sp)
    }
}

@Composable
private fun OtherOs(vm: AppViewModel, twoPane: Boolean) {
    val s = vm.summary
    val review = s?.review?.count { it.status == "needs_review" } ?: vm.boot?.reviewCount ?: 0
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(
            Modifier.weight(1.15f).fillMaxHeight().clip(RoundedCornerShape(28.dp, 10.dp, 28.dp, 28.dp)).background(C.primary).clickable { vm.go(Screen.Home) }.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Filled.Savings, null, tint = C.onPrimary, modifier = Modifier.size(20.dp))
                Text("Finans", color = C.onPrimary, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.weight(1f))
            Text(s?.let { neg0(it.left) + " kr" } ?: "–", color = C.onPrimary, fontFamily = Mono, fontSize = 26.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, softWrap = false)
            Text("igjen å bruke i ${monthLabel(s?.month ?: "").lowercase()}", color = C.onPrimary.copy(alpha = .8f), fontSize = 12.sp)
            if (review > 0) Text("$review kvittering${if (review > 1) "er" else ""} til gjennomgang", color = C.onPrimary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            MiniOs("Domener", vm.domainToday?.let { "${count(it.second)} besøk i dag" } ?: "Trafikk og sikkerhet", Icons.Filled.Language, P.hero, P.onHero) { vm.go(Screen.Domains) }
            MiniOs("Mat", vm.todayMeal ?: "Ingen middag planlagt", Icons.Filled.Restaurant, tc(0xFF45462A), tc(0xFFE6E6AE)) { vm.go(Screen.Mat) }
        }
    }
}

@Composable
private fun MiniOs(title: String, sub: String, icon: ImageVector, bg: Color, fg: Color, onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp, 28.dp, 28.dp, 28.dp)).background(bg).clickable(onClick = onClick).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(icon, null, tint = fg, modifier = Modifier.size(18.dp))
            Text(title, color = fg, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }
        Text(sub, color = fg.copy(alpha = .85f), fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun ServerCard(st: ServerStatus?) {
    HCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Serverstatus", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            st?.uptime?.let { Text("● Oppe i $it", color = tc(0xFF7BE3A0), fontSize = 12.sp) }
        }
        if (st == null) Text("Ingen data fra serveren ennå.", color = C.text2, fontSize = 13.sp)
        else {
            listOf("CPU" to st.cpu, "Minne" to st.mem, "Lagring" to st.disk).forEach { (k, v) ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row { Text(k, color = C.text2, fontSize = 13.sp, modifier = Modifier.weight(1f)); Text(v?.let { "${it.toInt()} %" } ?: "–", fontFamily = Mono, fontSize = 13.sp) }
                    LinearProgressIndicator(progress = { ((v ?: 0.0) / 100).toFloat().coerceIn(0f, 1f) }, Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                        color = if ((v ?: 0.0) > 85) C.accent else C.primary, trackColor = C.surface2)
                }
            }
            st.temp?.let { Text("Temperatur ${it.toInt()} °C", color = C.text2, fontSize = 13.sp) }
        }
    }
}

/** Ruter: kompakt som i designet. Én rad per avgang med farget linjemerke, destinasjon og minutter, maks 4 avganger. */
@Composable
private fun RuterCard(lines: List<RuterLine>) {
    val rows = lines.flatMap { l -> l.departures.map { d -> l to d } }
        .sortedBy { (_, d) -> d.min ?: Int.MAX_VALUE }.take(4)
    val stop = lines.map { it.from }.distinct().singleOrNull()
    val ctx = androidx.compose.ui.platform.LocalContext.current
    // Trykk åpner Ruter-appen (universal link) med avreisestoppet.
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(C.surface1).clickable(onClickLabel = "Åpne Ruter") { openLink(ctx, ruterLink(lines.firstOrNull()?.from)) }
        .padding(18.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), verticalAlignment = Alignment.Bottom) {
            Text(if (stop.isNullOrBlank()) "Ruter" else "Ruter · $stop", fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("Sanntid", color = C.text2, fontSize = 12.5.sp)
        }
        if (rows.isEmpty()) Text("Ingen avganger. Sett opp strekninger i Homelab → Innstillinger → Integrasjoner.", color = C.text2, fontSize = 13.sp)
        rows.forEach { (l, d) ->
            Row(Modifier.fillMaxWidth().heightIn(min = 40.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.widthIn(min = 32.dp).height(24.dp).clip(RoundedCornerShape(6.dp)).background(d.color?.let { Color(it) } ?: tc(0xFFE60000)).padding(horizontal = 6.dp),
                    contentAlignment = Alignment.Center) {
                    Text(d.line, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                }
                Text(d.to ?: l.to, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text(d.min?.let { if (it <= 0) "nå" else "$it min" } ?: d.time ?: "–", fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

/* ---------------- Legg til widget og fanelinjer ---------------- */

/** Fanenavn som kan endres. Lagres når feltet mister fokus, ved «Ferdig» og når arket lukkes. */
@Composable
private fun TabNameField(vm: AppViewModel, key: String, default: String, on: Boolean, modifier: Modifier) {
    val saved = vm.layout.names[key] ?: ""
    var text by remember(key, saved) { mutableStateOf(saved) }
    val focus = LocalFocusManager.current
    val latest by rememberUpdatedState(text)
    fun save(v: String) { if (v.trim() != saved) vm.rename(key, v) }
    DisposableEffect(key) { onDispose { if (latest.trim() != (vm.layout.names[key] ?: "")) vm.rename(key, latest) } }
    androidx.compose.foundation.text.BasicTextField(
        text, { text = it.take(30) }, singleLine = true,
        textStyle = androidx.compose.ui.text.TextStyle(color = if (on) C.text else C.text2, fontSize = 15.sp),
        cursorBrush = androidx.compose.ui.graphics.SolidColor(C.primary),
        keyboardOptions = KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { save(text); focus.clearFocus() }),
        modifier = modifier.onFocusChanged { if (!it.isFocused) save(text) }.padding(vertical = 8.dp),
        decorationBox = { inner -> Box { if (text.isEmpty()) Text(default, color = if (on) C.text else C.text2, fontSize = 15.sp); inner() } },
    )
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun WidgetGallery(vm: AppViewModel) {
    ModalBottomSheet(onDismissRequest = { vm.widgetGallery = false }, containerColor = C.surface1) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp, 0.dp, 20.dp, 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Legg til widget", style = MaterialTheme.typography.titleLarge)
            HomeLayout.SECTIONS.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { id ->
                        val (name, desc, icon) = WIDGETS.getValue(id)
                        val shown = vm.layout.visible(id)
                        Column(Modifier.weight(1f).clip(RoundedCornerShape(24.dp)).background(C.surface2).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Icon(icon, null, tint = C.primary)
                            Text(name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(desc, color = C.text2, fontSize = 12.sp, maxLines = 2, minLines = 2, overflow = TextOverflow.Ellipsis)
                            Button(onClick = { vm.setHidden(id, false) }, enabled = !shown, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text(if (shown) "Lagt til" else "Legg til") }
                        }
                    }
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                }
            }
            NavEditors(vm)
            OutlinedButton(onClick = { vm.resetLayout() }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp)) { Text("Tilbakestill") }
        }
    }
}

/** Navigasjonslinjene i Homelab og Finans: nytt navn (tomt = standard), rekkefølge og skjul. */
@Composable
internal fun NavEditors(vm: AppViewModel) {
    NavEditor(vm, "Navigasjon · Homelab", "hlTabs", "hl.", vm.layout.hlTabs, HL_NAMES, HomeLayout.FIXED_HL)
    NavEditor(vm, "Navigasjon · Finans", "finTabs", "fin.", vm.layout.finTabs, FIN_NAMES, HomeLayout.FIXED_FIN)
    Text("Trykk på et navn for å endre det. Tomt felt gir standardnavnet.", color = C.text2, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 8.dp))
}

@Composable
private fun NavEditor(vm: AppViewModel, title: String, key: String, prefix: String, ids: List<String>, names: Map<String, String>, fixed: Set<String>) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        SectionLabel(title)
        ids.forEachIndexed { i, id ->
            val on = id in fixed || vm.layout.visible(id)
            Row(Modifier.fillMaxWidth().clip(itemShape(i, ids.size)).background(C.surface2).padding(16.dp, 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${i + 1}", color = C.text2, fontFamily = Mono, fontSize = 13.sp)
                TabNameField(vm, prefix + id, names[id] ?: id, on, Modifier.weight(1f))
                SmallRound("▲", enabled = i > 0) { vm.move(key, id, -1) }
                SmallRound("▼", enabled = i < ids.size - 1) { vm.move(key, id, 1) }
                if (id in fixed) Text("Alltid", color = C.text2, fontSize = 12.sp, modifier = Modifier.padding(start = 6.dp))
                else Switch(checked = on, onCheckedChange = { vm.setHidden(id, !it) }, colors = SwitchDefaults.colors(checkedTrackColor = C.primary, checkedThumbColor = C.onPrimary))
            }
        }
    }
}

package no.kristo.finanshub.ui

import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import org.json.JSONObject

/*
 * Prompt 43 (claude-code-media-arr.md, fasit Media.dc.html 2a variant «mobile»): Media i fullskjerm fra Mer.
 * «‹ Tilbake», «Media» (Newsreader 34), ✦ Glimt og ⚙ øverst, pille-faner Kommer snart · Sonarr · Radarr · qBittorrent · Prowlarr.
 * Følger Papir-temaet (ink/bg/card/line/lab/mut); egne farger bare for status (grønn #2f6b4a, gul #a0671a, rød #b23a2a).
 * Stor skjerm (≥ 600 dp, claude-code-stor-skjerm-alle-sider.md 1b/1c): plakatvegg 6 kolonner og valgt serie/film som panel fra høyre (360).
 * Alle trykkflater minst 44 dp; haptikk ved Last ned, Pause og Slett (i P43.kt).
 */

internal val OK43 = Color(0xFF2F6B4A)
internal val WARN43 = Color(0xFFA0671A)
internal val RED43 = Color(0xFFB23A2A)
private val MEDIA_TABS43 = listOf("snart" to "Kommer snart", "sonarr" to "Sonarr", "radarr" to "Radarr", "qbit" to "qBittorrent", "prowlarr" to "Prowlarr", "spill" to "Avspilling") // prompt 44: Avspilling etter Prowlarr

@Composable
// Prompt 45 (claude-code-media-mer-farger.md): Lastes ned blå, Venter gul, Ferdig grønn, Mangler rød, Uovervåket grå.
internal fun stColor43(k: String): Color = when (k) { "ok" -> OK43; "dl" -> Color(0xFF3D7DD6); "warn" -> WARN43; "missing", "err" -> RED43; else -> PaperPal.current.mut }

@Composable
internal fun MediaScreen43(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p43
    BackHandler { vm.closeMedia43() }
    LaunchedEffect(s.tab) { vm.loadMedia43() }
    // qBittorrent: hvert 2. sekund mens fanen er åpen.
    LaunchedEffect(s.tab, s.mediaOpen) { while (s.tab == "qbit" && s.mediaOpen) { delay(2000); vm.loadTorrents43() } }
    LaunchedEffect(s.toast) { if (s.toast != null) { delay(2600); s.toast = null } }
    val navB = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    BoxWithConstraints(Modifier.fillMaxSize().background(p.bg)) {
        val wide = maxWidth >= 600.dp
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(start = 8.dp, end = 12.dp, top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                // Prompt 45: systemets tilbakeknapp (rund glass-knapp med ‹) og ⋯ i stedet for ⚙ (innstillingene ligger i Innstillinger → Media).
                BackCircle45("Tilbake") { vm.closeMedia43() }
                Spacer(Modifier.weight(1f))
                IconBtn43("✦", "Glimt", s.glimtOpen) { s.glimtOpen = !s.glimtOpen }
                Spacer(Modifier.width(6.dp))
                MediaMenu45(vm)
            }
            PSerif("Media", 34.sp, modifier = Modifier.padding(start = 18.dp, top = 2.dp, bottom = 8.dp), maxLines = 1)
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                MEDIA_TABS43.forEach { (k, n) -> MediaTab45(k, n, s.tab == k) { s.tab = k; s.detail = null; s.relFor = null } } // prompt 45: tjenestefarger
            }
            ServerRow44(vm) // prompt 44: felles servervalg
            if (s.glimtOpen) MediaGlimt43(vm)
            if (s.missing) Note43("Media er ikke satt opp på serveren ennå. Oppdater Homelab og legg inn Sonarr, Radarr, qBittorrent og Prowlarr under Integrasjoner.")
            s.error?.let { e -> Note43(e, red = true) { s.error = null; vm.p44.errKind = null } }
            ErrActions44(vm) // prompt 44: «Logg inn på nytt» / «Prøv igjen»
            Spacer(Modifier.height(10.dp))
            Box(Modifier.weight(1f).fillMaxWidth()) {
                val pad = PaddingValues(16.dp, 4.dp, 16.dp, 28.dp + navB)
                when (s.tab) {
                    "snart" -> Upcoming43(vm, pad)
                    "sonarr" -> Library43(vm, "tv", pad, wide)
                    "radarr" -> Library43(vm, "film", pad, wide)
                    "qbit" -> Torrents43(vm, pad)
                    "spill" -> Playback44(vm, pad) // prompt 44
                    else -> Prowlarr43(vm, pad)
                }
                // Detalj: fullskjerm på telefon, panel fra høyre (360) på stor skjerm.
                s.detail?.let { d ->
                    if (wide) Box(Modifier.align(Alignment.CenterEnd).width(360.dp).fillMaxHeight().padding(end = 8.dp, bottom = 8.dp)
                        .shadow(18.dp, RoundedCornerShape(22.dp)).clip(RoundedCornerShape(22.dp)).background(p.card)) { Detail43(vm, d, PaddingValues(16.dp, 14.dp, 16.dp, 24.dp + navB)) }
                    else Box(Modifier.fillMaxSize().background(p.bg)) { Detail43(vm, d, pad) }
                }
                if (s.relFor != null) Box(Modifier.fillMaxSize().background(p.bg)) { Releases43(vm, pad, wide) }
            }
        }
        s.toast?.let { t ->
            Box(Modifier.align(Alignment.BottomCenter).padding(bottom = navB + 18.dp, start = 16.dp, end = 16.dp).clip(RoundedCornerShape(14.dp)).background(p.ink).padding(14.dp, 10.dp)) {
                Text(t, color = p.bg, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 2)
            }
        }
        Undo44(vm) // prompt 44: «Angre» etter Slett fil
        UnmonSheet45(vm) // prompt 45: Slett uovervåkede (ark + Angre)
    }
    if (s.add != null) AddSheet43(vm)
    s.torMenu?.let { h -> TorMenu43(vm, h) }
    s.torDelete?.let { h -> TorDelete43(vm, h) }
    if (s.magnetOpen) Magnet43(vm)
    if (s.idxAdd) IdxAdd43(vm)
    s.optSheet?.let { o -> OptSheet43(vm, o) }
}

/* ---------------- Små byggeklosser ---------------- */

@Composable
internal fun Pill43(text: String, on: Boolean, count: Int? = null, onClick: () -> Unit) {
    val p = PaperPal.current
    Row(
        Modifier.heightIn(min = 44.dp).clickable(role = Role.Tab, onClickLabel = text) { Haptics.select(); onClick() }, verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(Modifier.height(36.dp).clip(CircleShape).background(if (on) p.ink else p.card).border(1.dp, if (on) p.ink else p.line, CircleShape).padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(text, color = if (on) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
            if (count != null) Text("$count", color = (if (on) p.bg else p.ink).copy(alpha = .6f), fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
        }
    }
}

@Composable
internal fun IconBtn43(icon: String, label: String, on: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.size(44.dp).clip(CircleShape).background(if (on) RED43 else p.card).border(1.dp, if (on) RED43 else p.line, CircleShape)
        .clickable(role = Role.Button, onClickLabel = label, onClick = onClick), contentAlignment = Alignment.Center) {
        Text(icon, color = if (on) Color.White else p.ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
internal fun Btn43(text: String, dark: Boolean = false, color: Color? = null, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    val p = PaperPal.current
    val bg = color ?: if (dark) p.ink else Color.Transparent
    Box(modifier.heightIn(min = 44.dp).clip(CircleShape).background(bg).border(1.dp, if (color != null || dark) bg else p.line, CircleShape)
        .clickable(enabled = enabled, role = Role.Button) { onClick() }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
        Text(text, color = if (color != null) Color.White else if (dark) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1)
    }
}

@Composable
internal fun Note43(text: String, red: Boolean = false, onClose: (() -> Unit)? = null) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().padding(16.dp, 8.dp, 16.dp, 0.dp).clip(RoundedCornerShape(14.dp)).background(p.card).padding(12.dp, 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, color = if (red) RED43 else p.mut, fontSize = 13.sp, modifier = Modifier.weight(1f))
        if (onClose != null) Text("✕", color = p.mut, modifier = Modifier.size(36.dp).clip(CircleShape).clickable(onClick = onClose).wrapContentSize())
    }
}

@Composable
internal fun Poster43(vm: AppViewModel, url: String?, color: Long?, title: String, w: Dp, h: Dp, modifier: Modifier = Modifier) {
    var bmp by remember(url) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(url) { if (!url.isNullOrBlank()) bmp = if (url.startsWith("/")) vm.image(url) else vm.bgImage41(url) }
    val shape = RoundedCornerShape(8.dp)
    Box(modifier.size(w, h).clip(shape).background(color?.let { Color(it) } ?: Color(0xFF2E3B4A)), contentAlignment = Alignment.BottomStart) {
        val b = bmp
        if (b != null) Image(b.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        else Text(title, color = Color.White.copy(alpha = .9f), fontFamily = PaperFonts.serif, fontSize = if (w < 70.dp) 9.sp else 13.sp, lineHeight = if (w < 70.dp) 10.sp else 15.sp,
            maxLines = 4, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(6.dp))
    }
}

@Composable
internal fun Field43(value: String, hint: String, password: Boolean = false, onDone: (() -> Unit)? = null, onChange: (String) -> Unit) {
    val p = PaperPal.current
    Box(Modifier.fillMaxWidth().heightIn(min = 50.dp).clip(RoundedCornerShape(14.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp),
        contentAlignment = Alignment.CenterStart) {
        if (value.isEmpty()) Text(hint, color = p.mut, fontSize = 14.5.sp, maxLines = 1)
        BasicTextField(value, onChange, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 14.5.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.lab),
            visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            keyboardOptions = KeyboardOptions(imeAction = if (onDone != null) ImeAction.Search else ImeAction.Done),
            keyboardActions = KeyboardActions(onSearch = { onDone?.invoke() }, onDone = { onDone?.invoke() }), modifier = Modifier.fillMaxWidth())
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun Sheet43(onClose: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val p = PaperPal.current
    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = p.bg, contentColor = p.ink,
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) }) {
        // Stor skjerm: arket er et sentrert vindu på maks 560 (claude-code-stor-skjerm-alle-sider.md).
        Column(Modifier.fillMaxWidth().wrapContentWidth().widthIn(max = 560.dp).fillMaxWidth().heightIn(max = 720.dp).verticalScroll(rememberScrollState())
            .navigationBarsPadding().imePadding().padding(18.dp, 0.dp, 18.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

@Composable
internal fun Toggle43(title: String, sub: String?, on: Boolean, onChange: (Boolean) -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { onChange(!on) }, verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
            if (sub != null) Text(sub, color = p.mut, fontSize = 12.sp)
        }
        Switch(on, onChange, colors = SwitchDefaults.colors(checkedThumbColor = p.bg, checkedTrackColor = p.ink, uncheckedThumbColor = p.mut, uncheckedTrackColor = p.line, uncheckedBorderColor = p.line))
    }
}

@Composable
private fun Choice43(options: List<Pair<String, String>>, cur: String?, onPick: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        options.forEach { (k, n) -> Pill43(n, cur == k) { onPick(k) } }
    }
}

/* ---------------- Kommer snart ---------------- */

@Composable
private fun Upcoming43(vm: AppViewModel, pad: PaddingValues) {
    val p = PaperPal.current
    val s = vm.p43
    val list = s.upcoming
    val today = java.time.LocalDate.now().toString()
    val nb = java.util.Locale("nb", "NO")
    LazyColumn(Modifier.fillMaxSize(), contentPadding = pad, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (list == null && !s.missing) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
        else if (list.isNullOrEmpty()) item { Text("Ingenting kommer de neste 7 dagene.", color = p.mut, fontSize = 13.sp) }
        // Mørk stripe «Lastes ned ›» med de aktive og Pause alt (som på web).
        val active = list.orEmpty().filter { status43(it.status).second == "dl" }
        if (active.isNotEmpty()) item {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color(0xFF1B1A17)).clickable { s.tab = "qbit" }.padding(14.dp, 10.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Lastes ned · ${active.size} ›", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
                Text("Pause alt", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.5.sp,
                    modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape).clickable { vm.torAll43(true) }.padding(horizontal = 10.dp).wrapContentHeight())
            }
        }
        list.orEmpty().groupBy { it.day }.forEach { (day, items) ->
            item(key = "d-$day") {
                val d = runCatching { java.time.LocalDate.parse(day) }.getOrNull()
                val label = when {
                    day == today -> "I dag"
                    d != null && d == java.time.LocalDate.now().plusDays(1) -> "I morgen"
                    d != null -> d.dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, nb).replaceFirstChar { it.uppercase() } + " ${d.dayOfMonth}."
                    else -> day
                }
                PLabel(label, color = if (day == today) p.lab else p.mut, modifier = Modifier.padding(top = 6.dp))
            }
            items.forEach { u ->
                item(key = "u-" + u.key) {
                    val (st, c) = status43(u.status, u.progress)
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).clickable {
                        val lib = if (u.kind == "tv") s.series else s.movies
                        val hit = lib?.firstOrNull { it.id == u.refId } ?: u.refId?.let { id -> MItem43(id, u.kind, u.title, null, null, null, false, true, null, null, 0, 0, 0, u.poster, u.color, true, null, null, null, false, null, null, null, null, null) }
                        if (hit != null) { s.tab = if (u.kind == "tv") "sonarr" else "radarr"; vm.openItem43(hit) }
                    }.padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Poster43(vm, u.poster, u.color, u.title, 52.dp, 78.dp)
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            PSerif(u.title, 17.sp, maxLines = 1)
                            Text(listOfNotNull(u.code, u.epTitle).joinToString(" · ").ifBlank { "Film" }, color = p.ink, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Box(Modifier.size(7.dp).clip(CircleShape).background(stColor43(c)))
                                Text(st, color = stColor43(c), fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp)
                            }
                        }
                        u.time?.let { Text(it, color = p.mut, fontFamily = PaperFonts.mono, fontSize = 12.sp) }
                    }
                }
            }
        }
    }
}

/* ---------------- Bibliotek (Sonarr / Radarr) ---------------- */

@Composable
private fun Library43(vm: AppViewModel, kind: String, pad: PaddingValues, wide: Boolean) {
    val p = PaperPal.current
    val s = vm.p43
    val all = if (kind == "tv") s.series else s.movies
    val filters = if (kind == "tv") listOf("alle" to "Alle", "mangler" to "Mangler", "fortsetter" to "Fortsetter", "avsluttet" to "Avsluttet")
        else listOf("alle" to "Alle", "lastet" to "Lastet ned", "mangler" to "Mangler", "kommer" to "Kommer")
    fun match(it: MItem43, f: String) = when (f) {
        "mangler" -> if (kind == "tv") it.missing > 0 else !it.hasFile && it.status != "ann"
        "fortsetter" -> !it.ended
        "avsluttet" -> it.ended
        "lastet" -> it.hasFile
        "kommer" -> !it.hasFile && (it.status == "ann" || it.status == "announced")
        else -> true
    }
    val f = if (filters.any { it.first == s.libFilter }) s.libFilter else "alle"
    val q44 = vm.p44.libQ
    val list = all.orEmpty().filter { match(it, f) && libMatch44(it, q44) } // prompt 44: søk i biblioteket
    LazyVerticalGrid(GridCells.Fixed(if (wide) 6 else 3), Modifier.fillMaxSize(), contentPadding = pad, verticalArrangement = Arrangement.spacedBy(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Btn43(if (kind == "tv") "+ Legg til serie" else "+ Legg til film", dark = true, modifier = Modifier.fillMaxWidth()) { s.add = kind; s.addQ = ""; s.addRes = null; s.addPick = null }
                LibSearch44(vm, kind, all.orEmpty().size)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    filters.forEach { (k, n) -> Pill43(n, f == k, all.orEmpty().count { match(it, k) }) { s.libFilter = k } }
                }
            }
        }
        if (all == null && !s.missing) item(span = { GridItemSpan(maxLineSpan) }) { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
        if (all != null && list.isEmpty() && q44.isNotBlank()) item(span = { GridItemSpan(maxLineSpan) }) { LibNoHit44(vm, kind) }
        list.forEach { it ->
            item(key = "${kind}-${it.id}") {
                Column(Modifier.clip(RoundedCornerShape(10.dp)).clickable { vm.openItem43(it) }, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    BoxWithConstraints(Modifier.fillMaxWidth()) {
                        Poster43(vm, it.poster, it.color, it.title, maxWidth, maxWidth * 1.5f)
                        if (kind == "tv" && it.missing > 0) Box(Modifier.align(Alignment.TopEnd).padding(5.dp).clip(CircleShape).background(WARN43).padding(horizontal = 7.dp, vertical = 2.dp)) {
                            Text("${it.missing}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                        }
                        if (kind == "film" && it.hasFile) Box(Modifier.align(Alignment.TopEnd).padding(5.dp).size(18.dp).clip(CircleShape).background(OK43), contentAlignment = Alignment.Center) {
                            Text("✓", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Text(it.title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, lineHeight = 15.sp)
                    Text(listOfNotNull(it.year?.toString(), if (kind == "tv") "${it.have}/${it.total}" else it.profile).joinToString(" · "), color = p.mut, fontSize = 11.5.sp, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun Detail43(vm: AppViewModel, d: MItem43, pad: PaddingValues) {
    val p = PaperPal.current
    val s = vm.p43
    val ctx = LocalContext.current
    val app = if (d.kind == "tv") "sonarr" else "radarr"
    var delAsk by remember(d.id) { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = pad, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            BackCircle45(if (d.kind == "tv") "Tilbake til Serier" else "Tilbake til Filmer") { s.detail = null; s.seasons = null } // prompt 45
        }
        // Prompt 44: banner med fanart, plakat 2:3, tittel, fakta og info-brikker.
        item { Banner44(vm, d) }
        item {
            // Chips som åpner valgark (lagres med PUT).
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                val prof = d.profile ?: s.profiles[app]?.firstOrNull { it.id == d.profileId }?.name ?: "Profil"
                Pill43("Profil · $prof", false) { s.optSheet = "profile" }
                // Prompt 45: «Slett uovervåkede» for serien (Sonarr) / filmen (Radarr), bare admin, med bekreftelse.
                if (vm.userIsAdmin) Pill43(if (d.kind == "tv") "Slett uovervåkede" else "Slett uovervåket fil", false) { vm.openUnmon45(app, d.id) }
                if (d.kind == "tv") {
                    Pill43("Overvåking · " + (MONITOR43.firstOrNull { it.first == d.monitor }?.second ?: if (d.monitored) "På" else "Av"), false) { s.optSheet = "monitor" }
                    Pill43("Serietype · " + (TYPES43.firstOrNull { it.first == d.seriesType }?.second ?: "Standard"), false) { s.optSheet = "type" }
                } else {
                    Pill43("Last ned når · " + (AVAIL43.firstOrNull { it.first == d.availability }?.second ?: "Utgitt"), false) { s.optSheet = "avail" }
                    Pill43("Overvåket · " + if (d.monitored) "Ja" else "Nei", false) { vm.saveItem43(JSONObject().put("monitored", !d.monitored)) }
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (d.kind == "tv") {
                    if (d.missing > 0) Btn43("🔍 Søk alle manglende (${d.missing})", dark = true) { vm.command43("sonarr", "MissingEpisodeSearch", JSONObject().put("seriesId", d.id), "Søker etter ${d.missing} manglende …") }
                } else {
                    Btn43("🔍 Automatisk søk", dark = true) { vm.command43("radarr", "MoviesSearch", JSONObject().put("movieIds", org.json.JSONArray().put(d.id)), "Søker etter ${d.title} …") }
                    Btn43("Interaktivt søk") { vm.openRelease43(d.title, listOfNotNull(d.year?.toString(), d.profile?.let { "Profil $it" }).joinToString(" · "), "movieId=${d.id}") }
                }
                if (d.playUrl != null) Btn43("▶ Spill av") { openLink(ctx, d.playUrl) }
                Btn43("Slett", color = RED43) { delAsk = true }
            }
        }
        if (delAsk) item {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Slette ${d.title} fra ${if (d.kind == "tv") "Sonarr" else "Radarr"}?", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Btn43("Behold filene") { vm.deleteItem43(d, false) }
                    Btn43("Slett med filene", color = RED43) { vm.deleteItem43(d, true) }
                    Btn43("Avbryt") { delAsk = false }
                }
            }
        }
        if (d.kind == "film" && d.hasFile) item { MovieFileBtns44(vm, d) } // prompt 44: last ned på nytt / slett fil
        if (d.kind == "film") d.fileLine?.takeIf { it.isNotBlank() }?.let { f -> item {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(14.dp)) { PLabel("Fil"); Text(f, color = p.ink, fontSize = 13.sp, fontFamily = PaperFonts.mono) }
        } }
        d.overview?.let { o -> item { Text(o, color = p.mut, fontSize = 13.sp, lineHeight = 18.sp, maxLines = 5, overflow = TextOverflow.Ellipsis) } }
        if (d.kind == "tv") seasons43(vm, d)
    }
}

private fun LazyListScope.seasons43(vm: AppViewModel, d: MItem43) {
    val s = vm.p43
    val ss = s.seasons
    if (ss == null) { item { Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = PaperPal.current.ink) } }; return }
    ss.forEach { se ->
        item(key = "se-${se.n}") {
            val p = PaperPal.current
            val miss = se.eps.count { !it.hasFile && it.status == "missing" }
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).clickable { s.openSeason = if (s.openSeason == se.n) null else se.n }.padding(start = 4.dp, end = 10.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Text(if (se.monitored) "▮" else "▯", color = if (se.monitored) p.ink else p.mut, fontSize = 18.sp,
                    modifier = Modifier.size(44.dp).clip(CircleShape).clickable(onClickLabel = if (se.monitored) "Slutt å overvåke sesongen" else "Overvåk sesongen") { vm.monitorSeason43(se.n, !se.monitored) }.wrapContentSize())
                Column(Modifier.weight(1f).padding(vertical = 10.dp)) {
                    PSerif(if (se.n == 0) "Spesialepisoder" else "Sesong ${se.n}", 17.sp, maxLines = 1)
                    Text("${se.eps.count { it.hasFile }} av ${se.eps.size}" + if (miss > 0) " · $miss mangler" else "", color = if (miss > 0) WARN43 else p.mut, fontSize = 12.sp)
                }
                if (miss > 0) Text("Søk sesong", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 12.5.sp,
                    modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape).clickable { vm.command43("sonarr", "SeasonSearch", JSONObject().put("seriesId", d.id).put("seasonNumber", se.n), "Søker i sesong ${se.n} …") }.padding(horizontal = 8.dp).wrapContentHeight())
                Text(if (s.openSeason == se.n) "▴" else "▾", color = p.mut, fontSize = 14.sp, modifier = Modifier.padding(start = 6.dp))
            }
        }
        if (s.openSeason == se.n) se.eps.forEach { e ->
            item(key = "ep-${e.id}-${se.n}-${e.n}") {
                val p = PaperPal.current
                val (st, c) = status43(if (!e.monitored && !e.hasFile) "unmonitored" else e.status)
                val needs = !e.hasFile && (e.status == "missing" || e.status == "stalled")
                Column(Modifier.fillMaxWidth().padding(horizontal = 4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(if (e.monitored) "▮" else "▯", color = if (e.monitored) p.ink else p.mut, fontSize = 15.sp,
                            modifier = Modifier.size(44.dp).clip(CircleShape).clickable(onClickLabel = "Overvåk episoden") { vm.monitorEp43(e, !e.monitored) }.wrapContentSize())
                        Text("E%02d".format(e.n), color = p.mut, fontFamily = PaperFonts.mono, fontSize = 12.sp, modifier = Modifier.width(40.dp))
                        Column(Modifier.weight(1f)) {
                            Text(e.title.ifBlank { "Episode ${e.n}" }, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            // På mobil står statusen i undertittelen når knappene vises.
                            Text(listOfNotNull(e.air, if (needs) st else null).joinToString(" · "), color = if (needs) stColor43(c) else p.mut, fontSize = 12.sp, maxLines = 1)
                        }
                        if (!needs) Text(st, color = stColor43(c), fontWeight = FontWeight.SemiBold, fontSize = 11.5.sp, maxLines = 1,
                            modifier = Modifier.clip(CircleShape).background(stColor43(c).copy(alpha = .12f)).padding(horizontal = 8.dp, vertical = 3.dp))
                    }
                    if (needs) Row(Modifier.padding(start = 84.dp, bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Btn43("🔍 Automatisk søk") { vm.command43("sonarr", "EpisodeSearch", JSONObject().put("episodeIds", org.json.JSONArray().put(e.id)), "Søker etter E%02d …".format(e.n)) }
                        Btn43("Interaktivt søk", dark = true) { vm.openRelease43(d.title, "S%02dE%02d · %s".format(se.n, e.n, e.title), "episodeId=${e.id}") }
                    }
                    if (e.hasFile) EpFileBtns44(vm, d, se, e) // prompt 44
                    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                }
            }
        }
    }
}

private val MONITOR43 = listOf("all" to "Alle episoder", "future" to "Fremtidige", "missing" to "Manglende", "existing" to "Eksisterende", "firstSeason" to "Første sesong",
    "lastSeason" to "Siste sesong", "pilot" to "Bare pilot", "none" to "Ingen")
private val TYPES43 = listOf("standard" to "Standard", "daily" to "Daglig", "anime" to "Anime")
private val AVAIL43 = listOf("announced" to "Annonsert", "inCinemas" to "På kino", "released" to "Utgitt digitalt")

@Composable
private fun OptSheet43(vm: AppViewModel, o: String) {
    val p = PaperPal.current
    val s = vm.p43
    val d = s.detail
    val close = { s.optSheet = null }
    Sheet43(close) {
        when (o) {
            "settings" -> {
                PSerif("Media", 24.sp)
                Text("Tjenestenøklene ligger bare på serveren. Appen snakker med Homelab, som er proxy til tjenestene.", color = p.mut, fontSize = 13.sp)
                if (s.services.isEmpty()) Text(if (s.missing) "Media er ikke på serveren ennå." else "Henter status …", color = p.mut, fontSize = 13.sp)
                s.services.forEach { x ->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).padding(14.dp, 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        // Prompt 44: samme status som Innstillinger → Integrasjoner (én kilde); «Ikke satt opp» bare når begge sier det.
                        val integ = vm.integOk44(x.key)
                        val conf = x.configured || integ == true
                        Box(Modifier.size(9.dp).clip(CircleShape).background(if (!conf) p.line else if (x.ok || (!x.configured && integ == true)) OK43 else RED43))
                        Column(Modifier.weight(1f)) {
                            Text(x.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            Text(if (!conf) "Ikke satt opp · Integrasjoner → MEDIA" else if (!x.configured) "Koblet til (Integrasjoner)" else listOfNotNull(x.version?.let { "v$it" }, x.ms?.let { "$it ms" }, x.error?.let { "Svarer ikke: $it" }).joinToString(" · "),
                                color = if (x.error != null) RED43 else p.mut, fontSize = 12.sp)
                        }
                    }
                }
                Btn43("Integrasjoner …", modifier = Modifier.fillMaxWidth()) { close(); s.mediaOpen = false; vm.openIntegrations43() }
            }
            "profile" -> {
                PSerif("Kvalitetsprofil", 22.sp)
                val app = if (d?.kind == "tv") "sonarr" else "radarr"
                s.profiles[app].orEmpty().forEach { pr ->
                    Btn43(pr.name, dark = pr.id == d?.profileId, modifier = Modifier.fillMaxWidth()) { vm.saveItem43(JSONObject().put("qualityProfileId", pr.id)); close() }
                }
                if (s.profiles[app].isNullOrEmpty()) Text("Ingen profiler fra ${if (app == "sonarr") "Sonarr" else "Radarr"} ennå.", color = p.mut, fontSize = 13.sp)
            }
            "monitor" -> {
                PSerif("Overvåking", 22.sp)
                MONITOR43.forEach { (k, n) -> Btn43(n, dark = d?.monitor == k, modifier = Modifier.fillMaxWidth()) { vm.saveItem43(JSONObject().put("monitor", k).put("monitored", k != "none")); close() } }
            }
            "type" -> {
                PSerif("Serietype", 22.sp)
                TYPES43.forEach { (k, n) -> Btn43(n, dark = d?.seriesType == k, modifier = Modifier.fillMaxWidth()) { vm.saveItem43(JSONObject().put("seriesType", k)); close() } }
            }
            "avail" -> {
                PSerif("Last ned når den er", 22.sp)
                AVAIL43.forEach { (k, n) -> Btn43(n, dark = d?.availability == k, modifier = Modifier.fillMaxWidth()) { vm.saveItem43(JSONObject().put("minimumAvailability", k)); close() } }
            }
        }
    }
}

/* ---------------- Legg til serie / film ---------------- */

@Composable
private fun AddSheet43(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p43
    val kind = s.add ?: return
    val app = if (kind == "tv") "sonarr" else "radarr"
    val close = { s.add = null; s.addPick = null }
    Sheet43(close) {
        val pick = s.addPick
        if (pick == null) {
            PSerif(if (kind == "tv") "Legg til serie" else "Legg til film", 24.sp)
            Field43(s.addQ, if (kind == "tv") "Søk etter serie …" else "Søk etter film …", onDone = { vm.lookup43(kind, s.addQ) }) { s.addQ = it }
            Btn43("Søk", dark = true, modifier = Modifier.fillMaxWidth()) { vm.lookup43(kind, s.addQ) }
            if (s.addBusy) CircularProgressIndicator(color = p.ink, modifier = Modifier.align(Alignment.CenterHorizontally))
            s.addRes?.let { res ->
                if (res.isEmpty()) Text("Fant ingenting.", color = p.mut, fontSize = 13.sp)
                res.forEach { r ->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).clickable {
                        if (r.exists) { close(); vm.openItem43(r) } else s.addPick = r
                    }.padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Poster43(vm, r.poster, r.color, r.title, 46.dp, 69.dp)
                        Column(Modifier.weight(1f)) {
                            PSerif(r.title, 17.sp, maxLines = 2)
                            Text(listOfNotNull(r.year?.toString(), r.network).joinToString(" · "), color = p.mut, fontSize = 12.sp)
                        }
                        Text(if (r.exists) "Finnes ›" else "Velg ›", color = if (r.exists) p.mut else p.lab, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                    }
                }
            }
        } else {
            val profiles = s.profiles[app].orEmpty()
            val roots = s.roots[app].orEmpty()
            var prof by remember(pick) { mutableStateOf(profiles.firstOrNull { it.name == "HD-1080p" }?.id ?: profiles.firstOrNull()?.id) }
            var mon by remember(pick) { mutableStateOf("all") }
            var type by remember(pick) { mutableStateOf("standard") }
            var avail by remember(pick) { mutableStateOf("released") }
            var root by remember(pick) { mutableStateOf(roots.firstOrNull()?.path) }
            var search by remember(pick) { mutableStateOf(true) }
            Text("‹ Tilbake til søket", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.heightIn(min = 44.dp).clickable { s.addPick = null }.wrapContentHeight())
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Poster43(vm, pick.poster, pick.color, pick.title, 64.dp, 96.dp)
                Column(Modifier.weight(1f)) {
                    PSerif(pick.title, 22.sp, maxLines = 2)
                    Text(listOfNotNull(pick.year?.toString(), pick.network).joinToString(" · "), color = p.mut, fontSize = 12.5.sp)
                    pick.overview?.let { Text(it, color = p.mut, fontSize = 12.sp, maxLines = 3, overflow = TextOverflow.Ellipsis) }
                }
            }
            PLabel("Kvalitetsprofil")
            if (profiles.isEmpty()) Text("Henter profiler …", color = p.mut, fontSize = 12.5.sp)
            Choice43(profiles.map { it.id.toString() to it.name }, prof?.toString()) { prof = it.toIntOrNull() }
            if (kind == "tv") {
                PLabel("Overvåking"); Choice43(MONITOR43, mon) { mon = it }
                PLabel("Serietype"); Choice43(TYPES43, type) { type = it }
            } else { PLabel("Last ned når den er"); Choice43(AVAIL43, avail) { avail = it } }
            if (roots.isNotEmpty()) {
                PLabel("Rotmappe")
                Choice43(roots.map { r -> r.path to (r.path + (r.free?.let { " · ${size43(it)} ledig" } ?: "")) }, root) { root = it }
            }
            Toggle43(if (kind == "tv") "Søk etter manglende med en gang" else "Søk etter filmen med en gang", null, search) { search = it }
            Btn43(if (s.addBusy) "Legger til …" else "Legg til", dark = true, enabled = !s.addBusy, modifier = Modifier.fillMaxWidth()) { vm.addItem43(pick, prof, mon, type, avail, root, search) }
        }
    }
}

/* ---------------- Interaktivt søk (1a-stil) ---------------- */

@Composable
private fun Releases43(vm: AppViewModel, pad: PaddingValues, wide: Boolean) {
    val p = PaperPal.current
    val s = vm.p43
    val (title, sub, q) = s.relFor ?: return
    val app = if (q.startsWith("movieId")) "radarr" else "sonarr"
    val all = s.rel?.items.orEmpty()
    val max = all.maxOfOrNull { it.seeders } ?: 0
    val list = when (s.relFilter) {
        "1080" -> all.filter { "1080" in it.quality || "1080" in it.title }
        "2160" -> all.filter { "2160" in it.quality || "2160" in it.title || "4K" in it.title }
        "norsk" -> all.filter { it.subs.contains("NO", true) || it.subs.contains("Norw", true) || it.title.contains("NORDiC", true) }
        "seed" -> all.sortedByDescending { it.seeders }
        else -> all.sortedWith(compareByDescending<MRel43> { it.best }.thenBy { it.rejected.isNotEmpty() }.thenByDescending { it.seeders })
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = pad, verticalArrangement = Arrangement.spacedBy(0.dp)) {
        item {
            BackCircle45("Tilbake") { s.relFor = null; s.rel = null } // prompt 45
            PLabel("Interaktivt søk")
            PSerif(title, 22.sp, maxLines = 2)
            Text(sub, color = p.mut, fontSize = 13.sp, maxLines = 2)
            Spacer(Modifier.height(6.dp))
            s.rel?.let { r -> Text("${r.items.size} treff" + (r.indexers?.let { " fra $it indeksere" } ?: "") + (r.ms?.let { " · " + String.format(java.util.Locale("nb", "NO"), "%.1f s", it / 1000.0) } ?: ""),
                color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp) }
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("alle" to "Alle", "1080" to "1080p", "2160" to "2160p", "norsk" to "Norsk tekst", "seed" to "Flest seedere").forEach { (k, n) -> Pill43(n, s.relFilter == k) { s.relFilter = k } }
            }
            RelStatus44(vm) // prompt 44: status per indekser, Avbryt, cache
            Box(Modifier.fillMaxWidth().height(2.dp).background(p.ink))
        }
        if (s.relBusy && list.isEmpty()) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
        else if (list.isEmpty() && !vm.p44.relFailAll) item { Text("Ingen utgivelser funnet.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(top = 12.dp)) }
        list.forEach { r ->
            item(key = "r-" + r.guid + r.indexer) {
                // Seedere: grønn ≥ 50 % av høyeste i søket, rød < 10 % (og alltid ved 0).
                val seedC = when { r.seeders == 0 -> RED43; max > 0 && r.seeders >= max * .5 -> OK43; max > 0 && r.seeders < max * .1 -> RED43; else -> p.ink }
                val got = r.guid in s.grabbed
                val shortTitle = r.title.removePrefix(title.replace(Regex("[^A-Za-z0-9]+"), ".")).trimStart('.').ifBlank { r.title }
                Column(Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            if (r.best) Text("Best treff for profilen", color = OK43, fontWeight = FontWeight.Bold, fontSize = 11.5.sp)
                            Text(shortTitle, color = p.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(r.quality, color = p.bg, fontWeight = FontWeight.Bold, fontSize = 10.5.sp, modifier = Modifier.clip(RoundedCornerShape(5.dp)).background(p.ink).padding(horizontal = 6.dp, vertical = 2.dp))
                                Text(size43(r.size), color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp)
                                Text("▲ ${r.seeders}/${r.peers}", color = seedC, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                                Text(r.indexer, color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                            }
                            val lang = listOfNotNull(r.langs.ifBlank { null }, r.subs.ifBlank { null }?.let { "Tekst: $it" }, r.age).joinToString(" · ")
                            if (lang.isNotBlank()) Text(lang, color = p.mut, fontSize = 11.5.sp, maxLines = 1)
                            if (r.rejected.isNotEmpty()) Text(r.rejected.joinToString(" · "), color = RED43, fontSize = 11.5.sp, maxLines = 2)
                        }
                        Box(Modifier.size(44.dp).clip(CircleShape).background(if (got) OK43 else p.ink).clickable(enabled = !got, onClickLabel = "Last ned") { vm.grab43(r, app) },
                            contentAlignment = Alignment.Center) { Text(if (got) "✓" else "↓", color = if (got) Color.White else p.bg, fontWeight = FontWeight.Bold, fontSize = 17.sp) }
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                }
            }
        }
    }
}

/* ---------------- qBittorrent ---------------- */

@Composable
private fun Torrents43(vm: AppViewModel, pad: PaddingValues) {
    val p = PaperPal.current
    val s = vm.p43
    val all = s.torrents
    fun kind(t: MTor43) = when (t.state) { // status-koder fra SERVER43 (P43.kt normaliserer rå qBittorrent-state)
        "seed" -> "ferdig"
        "pause" -> "pauset"
        "stall", "error" -> "fast"
        else -> if (t.progress >= 1f) "ferdig" else "aktiv"
    }
    val f = s.torFilter
    val list = all.orEmpty().filter { f == "alle" || kind(it) == f || (f == "aktive" && kind(it) == "aktiv") }
    val tr = s.transfer
    val allPaused = all.orEmpty().isNotEmpty() && all.orEmpty().all { kind(it) == "pauset" || kind(it) == "ferdig" }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = pad, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            // Mørkt sammendragskort (fra 1b).
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Color(0xFF1B1A17)).padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("QBITTORRENT", color = Color(0xFFE8A593), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp)
                PSerif("↓ " + speed43(tr?.dl ?: all.orEmpty().sumOf { it.dl }), 32.sp, Color.White, maxLines = 1)
                Text("${all.orEmpty().count { kind(it) == "aktiv" }} aktive · ↑ ${speed43(tr?.ul ?: 0)}" + (tr?.queued?.let { " · $it i køen" } ?: ""), color = Color.White.copy(alpha = .75f), fontSize = 12.5.sp)
                Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.heightIn(min = 44.dp).clip(CircleShape).background(Color.White).clickable { vm.torAll43(!allPaused) }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                        Text(if (allPaused) "Fortsett alt" else "Pause alt", color = Color(0xFF1B1A17), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                    val alt = tr?.alt == true
                    Box(Modifier.heightIn(min = 44.dp).clip(CircleShape).background(if (alt) RED43 else Color.White.copy(alpha = .14f)).clickable { vm.altSpeed43() }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                        Text("Alt-hastighet" + if (alt) (tr?.limit?.let { " · grense ${speed43(it)}" } ?: " på") else "", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
                    }
                }
            }
        }
        item { Btn43("+ Legg til magnet-lenke", modifier = Modifier.fillMaxWidth()) { s.magnetOpen = true } }
        item {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("alle" to "Alle", "aktiv" to "Aktive", "pauset" to "Pauset", "ferdig" to "Ferdige", "fast" to "Står fast").forEach { (k, n) ->
                    Pill43(n, f == k, if (k == "alle") all?.size ?: 0 else all.orEmpty().count { kind(it) == k }) { s.torFilter = k }
                }
            }
        }
        if (all == null && !s.missing) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
        else if (list.isEmpty()) item { Text("Ingen nedlastinger her.", color = p.mut, fontSize = 13.sp) }
        list.forEach { t ->
            item(key = "t-" + t.hash) {
                val k = kind(t)
                val pct = (t.progress * 100).toInt()
                val c = when (k) { "ferdig" -> OK43; "fast" -> WARN43; "pauset" -> p.mut; else -> RED43 }
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Poster43(vm, t.poster, t.color, t.name, 40.dp, 60.dp)
                        Column(Modifier.weight(1f)) {
                            Text(t.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(listOfNotNull(t.sub, t.size?.let { size43(it) } ?: "størrelse ukjent").joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 1)
                        }
                        PSerif("$pct %", 24.sp, c, maxLines = 1)
                    }
                    Box(Modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(p.line)) { Box(Modifier.fillMaxHeight().fillMaxWidth(t.progress.coerceIn(0f, 1f)).background(c)) }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        val line = when (k) {
                            "ferdig" -> "Ferdig"
                            "pauset" -> "Pauset"
                            "fast" -> t.sub?.takeIf { it.contains("Står fast") } ?: "Står fast"
                            else -> "↓ ${speed43(t.dl)}" + (t.eta?.let { " · ${eta43(it)} igjen" } ?: "")
                        }
                        Text(line, color = c, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, modifier = Modifier.weight(1f))
                        val paused = k == "pauset"
                        TorBtn43(if (paused) "▶" else "❚❚", if (paused) "Fortsett" else "Pause") { vm.torAct43(t.hash, if (paused) "resume" else "pause") }
                        TorBtn43("⋯", "Flere valg") { s.torMenu = t.hash; vm.loadFiles43(t.hash) }
                        TorBtn43("🗑", "Slett") { s.torDelete = t.hash }
                    }
                }
            }
        }
        // Diskplass per mappe (fra rotmappene), varsel under 1 TB.
        val disks = s.disk.ifEmpty { (s.roots["sonarr"].orEmpty() + s.roots["radarr"].orEmpty()).distinctBy { it.path } }
        if (disks.isNotEmpty()) item {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                PLabel("Diskplass")
                disks.forEach { d ->
                    val low = (d.free ?: Long.MAX_VALUE) < (1L shl 40)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(listOfNotNull(d.label, d.path).joinToString(" · "), color = p.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text((d.free?.let { size43(it) + " ledig" } ?: "–"), color = if (low) RED43 else p.mut, fontSize = 12.5.sp, fontWeight = if (low) FontWeight.Bold else FontWeight.Normal)
                    }
                }
            }
        }
    }
}

private fun eta43(s: Long): String = when { s >= 3600 -> "${s / 3600} t ${(s % 3600) / 60} min"; s >= 60 -> "${s / 60} min"; else -> "$s s" }

@Composable
private fun TorBtn43(icon: String, label: String, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.size(44.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(role = Role.Button, onClickLabel = label, onClick = onClick), contentAlignment = Alignment.Center) {
        Text(icon, color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun TorMenu43(vm: AppViewModel, hash: String) {
    val p = PaperPal.current
    val s = vm.p43
    val t = s.torrents?.firstOrNull { it.hash == hash }
    val close = { s.torMenu = null; s.files = null }
    Sheet43(close) {
        PSerif(t?.name ?: "Torrent", 19.sp, maxLines = 2)
        val paused = t?.state == "pause"
        Btn43(if (paused) "Fortsett" else "Pause", dark = true, modifier = Modifier.fillMaxWidth()) { vm.torAct43(hash, if (paused) "resume" else "pause"); close() }
        Btn43("Tving start", modifier = Modifier.fillMaxWidth()) { vm.torAct43(hash, "forceStart"); close() }
        PLabel("Køen")
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("up" to "Opp", "down" to "Ned", "top" to "Øverst", "bottom" to "Nederst").forEach { (k, n) ->
                Btn43(n, modifier = Modifier.weight(1f)) { vm.torAct43(hash, "priority", JSONObject().put("dir", k)) }
            }
        }
        Btn43("Sjekk filene på nytt", modifier = Modifier.fillMaxWidth()) { vm.torAct43(hash, "recheck"); close() }
        PLabel("Filer")
        val files = s.files
        if (files == null) Text("Henter filene …", color = p.mut, fontSize = 13.sp)
        else files.forEach { f ->
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { vm.setFile43(hash, f, !f.on) }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Checkbox(f.on, { vm.setFile43(hash, f, it) }, colors = CheckboxDefaults.colors(checkedColor = p.ink, uncheckedColor = p.mut, checkmarkColor = p.bg))
                Column(Modifier.weight(1f)) {
                    Text(f.name.substringAfterLast('/'), color = if (f.on) p.ink else p.mut, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(size43(f.size) + " · ${(f.progress * 100).toInt()} %", color = p.mut, fontSize = 11.5.sp)
                }
            }
        }
    }
}

@Composable
private fun TorDelete43(vm: AppViewModel, hash: String) {
    val s = vm.p43
    val t = s.torrents?.firstOrNull { it.hash == hash }
    Sheet43({ s.torDelete = null }) {
        PSerif("Slette ${t?.name ?: "nedlastingen"}?", 20.sp, maxLines = 3)
        Btn43("Slett, behold filene", modifier = Modifier.fillMaxWidth()) { vm.torDelete43(hash, false) }
        Btn43("Slett med filene", color = RED43, modifier = Modifier.fillMaxWidth()) { vm.torDelete43(hash, true) }
        Btn43("Avbryt", modifier = Modifier.fillMaxWidth()) { s.torDelete = null }
    }
}

@Composable
private fun Magnet43(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p43
    val ctx = LocalContext.current
    var cat by remember { mutableStateOf<String?>(null) }
    var paused by remember { mutableStateOf(false) }
    var seq by remember { mutableStateOf(false) }
    var fl by remember { mutableStateOf(false) }
    val (err, name, info) = checkMagnet43(s.magnet, s.torrents)
    Sheet43({ s.magnetOpen = false }) {
        PSerif("Legg til magnet-lenke", 22.sp)
        Field43(s.magnet, "magnet:?xt=urn:btih:… eller https://…/fil.torrent") { s.magnet = it }
        Btn43("Lim inn") {
            val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            cm?.primaryClip?.getItemAt(0)?.coerceToText(ctx)?.toString()?.let { s.magnet = it.trim() }
        }
        if (err != null) Text(err, color = RED43, fontSize = 13.sp)
        if (name != null) Column {
            Text(name, color = OK43, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 2)
            info?.let { Text(it, color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp) }
        }
        PLabel("Kategori")
        Choice43(listOf("" to "Ingen", "tv-sonarr" to "tv-sonarr", "radarr" to "radarr"), cat ?: "") { cat = it.ifBlank { null } }
        Text(when (cat) { "tv-sonarr" -> "Lagres i /data/downloads/tv"; "radarr" -> "Lagres i /data/downloads/film"; else -> "Lagres i /data/downloads" }, color = p.mut, fontSize = 12.sp)
        Toggle43("Start pauset", null, paused) { paused = it }
        Toggle43("Sekvensiell nedlasting", null, seq) { seq = it }
        Toggle43("Første og siste del først", null, fl) { fl = it }
        Btn43("Legg til", dark = true, enabled = err == null && name != null, modifier = Modifier.fillMaxWidth()) { vm.addMagnet43(s.magnet, cat, paused, seq, fl) }
    }
}

/* ---------------- Prowlarr ---------------- */

@Composable
private fun Prowlarr43(vm: AppViewModel, pad: PaddingValues) {
    val p = PaperPal.current
    val s = vm.p43
    val list = s.indexers
    LazyColumn(Modifier.fillMaxSize(), contentPadding = pad, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                PLabel("Prowlarr")
                val ok = list.orEmpty().count { it.ok }
                PSerif("$ok av ${list?.size ?: 0} indeksere svarer", 22.sp, maxLines = 2)
                Text("${list.orEmpty().sumOf { it.queries ?: 0 }} søk · ${list.orEmpty().sumOf { it.grabs ?: 0 }} hentet i dag", color = p.mut, fontSize = 12.5.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Btn43("Test alle", dark = true) { vm.testAll43() }
                    Btn43("+ Legg til indekser") { s.idxAdd = true; s.schemaPick = null; s.idxErr = null; vm.loadSchema43() }
                }
            }
        }
        if (list == null && !s.missing) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
        list.orEmpty().forEach { x ->
            item(key = "i-${x.id}") {
                val res = s.testRes[x.id]
                val testing = x.id in s.testing
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(start = 14.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(9.dp).clip(CircleShape).background(if (x.ok) OK43 else RED43))
                    Column(Modifier.weight(1f)) {
                        Text(x.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text(listOfNotNull(x.ms?.let { "$it ms" }, x.queries?.let { "$it søk" }, x.grabs?.let { "$it hentet i dag" }).joinToString(" · "), color = p.mut, fontSize = 12.sp)
                        x.error?.let { Text(it, color = RED43, fontSize = 12.sp) }
                        if (res != null) Text(res, color = if (res.startsWith("OK")) OK43 else RED43, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Btn43(if (testing) "Tester …" else "Test", enabled = !testing) { vm.testIndexer43(x.id) }
                }
            }
        }
        if (s.apps.isNotEmpty()) item {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                PLabel("Apper")
                s.apps.forEach { a ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(a.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                        Btn43("Synk nå") { vm.syncApp43(a) }
                    }
                }
            }
        }
    }
}

@Composable
private fun IdxAdd43(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p43
    var q by remember { mutableStateOf("") }
    var f by remember { mutableStateOf("alle") }
    Sheet43({ s.idxAdd = false; s.schemaPick = null }) {
        val pick = s.schemaPick
        if (pick == null) {
            PSerif("Legg til indekser", 24.sp)
            Field43(q, "Søk blant indekserne …") { q = it }
            Choice43(listOf("alle" to "Alle", "public" to "Offentlig", "private" to "Privat", "semiPrivate" to "Semi-privat", "usenet" to "Usenet"), f) { f = it }
            val all = s.schema
            if (all == null) Text(if (s.missing) "Prowlarr er ikke på serveren ennå." else "Henter katalogen …", color = p.mut, fontSize = 13.sp)
            all.orEmpty().filter { x -> (q.isBlank() || x.name.contains(q, true)) && (f == "alle" || (f == "usenet" && x.protocol == "usenet") || (f != "usenet" && x.privacy == f && x.protocol != "usenet")) }
                .take(80).forEach { x ->
                    val (lbl, col) = when { x.protocol == "usenet" -> "Usenet" to Color(0xFF7A5AD6); x.privacy == "private" -> "Privat" to RED43; x.privacy == "semiPrivate" -> "Semi" to WARN43; else -> "Offentlig" to OK43 }
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).clickable(enabled = !x.added) { s.schemaPick = x; s.idxErr = null }.padding(12.dp, 10.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(lbl, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 10.5.sp, modifier = Modifier.clip(RoundedCornerShape(5.dp)).background(col).padding(horizontal = 6.dp, vertical = 2.dp))
                        Column(Modifier.weight(1f)) {
                            Text(x.name, color = if (x.added) p.mut else p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            Text(listOfNotNull(x.categories, x.language, if (x.protocol == "usenet") "Usenet" else "Torrent").joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 1)
                        }
                        if (x.added) Text("Lagt til", color = p.mut, fontSize = 12.sp)
                    }
                }
        } else {
            val vals = remember(pick) { mutableStateMapOf<String, String>() }
            var prio by remember(pick) { mutableStateOf(25) }
            var sonarr by remember(pick) { mutableStateOf(true) }
            var radarr by remember(pick) { mutableStateOf(true) }
            Text("‹ Alle indeksere", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.heightIn(min = 44.dp).clickable { s.schemaPick = null }.wrapContentHeight())
            PSerif(pick.name, 24.sp)
            when (pick.login) {
                "user" -> {
                    Field43(vals["username"] ?: "", "Brukernavn") { vals["username"] = it }
                    Field43(vals["password"] ?: "", "Passord", password = true) { vals["password"] = it }
                }
                "key" -> {
                    Field43(vals["apiKey"] ?: "", "API-nøkkel", password = true) { vals["apiKey"] = it }
                    Text("Finnes under Profil → Sikkerhet / API hos ${pick.name}.", color = p.mut, fontSize = 12.sp)
                }
                "cookie" -> {
                    Field43(vals["cookie"] ?: "", "Cookie", password = true) { vals["cookie"] = it }
                    Text("Logg inn i nettleseren, åpne utviklerverktøy → Nettverk og kopier Cookie-verdien.", color = p.mut, fontSize = 12.sp)
                }
                else -> Text("Ingen innlogging trengs.", color = p.mut, fontSize = 13.sp)
            }
            PLabel("Prioritet")
            Choice43(listOf(1, 10, 25, 40, 50).map { it.toString() to it.toString() }, prio.toString()) { prio = it.toInt() }
            Toggle43("Sonarr", "Serier", sonarr) { sonarr = it }
            Toggle43("Radarr", "Filmer", radarr) { radarr = it }
            Text("Passord og nøkler lagres bare i Prowlarr, aldri i appen.", color = p.mut, fontSize = 12.sp)
            s.idxErr?.let { Text(it, color = RED43, fontSize = 13.sp) }
            Btn43(if (s.idxBusy) "Tester …" else "Test og lagre", dark = true, enabled = !s.idxBusy, modifier = Modifier.fillMaxWidth()) { vm.addIndexer43(pick, vals.toMap(), prio, sonarr, radarr) }
        }
    }
}

/* ---------------- Glimt ---------------- */

@Composable
private fun MediaGlimt43(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p43
    var q by remember { mutableStateOf("") }
    Column(Modifier.fillMaxWidth().padding(16.dp, 10.dp, 16.dp, 0.dp).clip(RoundedCornerShape(20.dp)).background(Color(0xFF1B1A17)).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GlimtOrb43(28.dp, busy = s.glimtBusy)
            Box(Modifier.weight(1f).heightIn(min = 44.dp), contentAlignment = Alignment.CenterStart) {
                if (q.isEmpty()) Text("«legg til Severance i 4K» · «pause alt»", color = Color.White.copy(alpha = .5f), fontSize = 14.sp, maxLines = 1)
                BasicTextField(q, { q = it }, singleLine = true, textStyle = TextStyle(color = Color.White, fontSize = 14.5.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(Color.White),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { vm.mediaGlimt43(q) }), modifier = Modifier.fillMaxWidth())
            }
            Box(Modifier.size(44.dp).clip(CircleShape).background(RED43).clickable(onClickLabel = "Spør Glimt") { vm.mediaGlimt43(q) }, contentAlignment = Alignment.Center) {
                Text("↑", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
            }
        }
        if (s.glimtBusy) Text("Glimt jobber …", color = Color.White.copy(alpha = .7f), fontSize = 13.sp)
        s.glimt?.let { g ->
            g.steps.forEach { st -> Text("✓ $st", color = Color(0xFF9FD3B4), fontFamily = PaperFonts.mono, fontSize = 11.5.sp) }
            if (g.text.isNotBlank()) Text(g.text.replace("**", ""), color = Color.White, fontSize = 14.sp, lineHeight = 19.sp)
            g.results.take(6).forEach { r ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = .08f)).padding(10.dp), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    // SERVER43: release-treff har {code, episodeTitle, hasText, release:{shortTitle, quality, sizeText, peersText, indexer}}; legg-til-treff {title, year, profile, monitorLabel}.
                    val rel = r.optJSONObject("release")
                    Column(Modifier.weight(1f)) {
                        Text(if (rel != null) listOfNotNull(r.s43("code"), r.s43("episodeTitle"), r.s43("hasText")).joinToString(" · ") else listOfNotNull(r.s43("title", "name"), r.s43("code")?.takeIf { it != "Film" }, r.i43("year")?.toString()).joinToString(" · "),
                            color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 2)
                        if (rel != null) Text(rel.s43("shortTitle", "title") ?: "", color = Color.White.copy(alpha = .85f), fontFamily = PaperFonts.mono, fontSize = 11.5.sp, maxLines = 2)
                        val x = rel ?: r
                        Text(listOfNotNull(x.s43("quality", "profile"), x.s43("sizeText") ?: x.l43("size")?.let { size43(it) }, x.s43("peersText") ?: x.i43("seeders")?.let { "▲ $it" }, x.s43("indexer", "monitorLabel", "statusText", "existsLabel")).joinToString(" · "),
                            color = if (rel != null) Color(0xFF9FD3B4) else Color.White.copy(alpha = .7f), fontSize = 12.sp, maxLines = 2)
                    }
                    r.optJSONObject("action")?.let { a -> Box(Modifier.heightIn(min = 40.dp).clip(CircleShape).background(Color.White).clickable { vm.glimtAct43(a) }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                        Text(a.s43("label") ?: "Velg", color = Color(0xFF1B1A17), fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                    } }
                }
            }
            if (g.actions.isNotEmpty()) Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                g.actions.forEach { a ->
                    Box(Modifier.heightIn(min = 44.dp).clip(CircleShape).background(Color.White).clickable { vm.glimtAct43(a) }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                        Text(a.s43("label") ?: "OK", color = Color(0xFF1B1A17), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

/* ---------------- Hjem-kortet (h43) ---------------- */

/**
 * Prompt 43 (claude-code-media-widgets.md, «Hjem i appen»): «MEDIA · LASTES NED» + «alle ›», tre nedlastinger (navn, episode, %, tynn linje;
 * står fast i gult), skillelinje, «KOMMER» med de to neste. Trykk → Media (qBittorrent hvis noe lastes ned, ellers Kommer snart).
 */
@Composable
internal fun HomeMedia43(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p43
    LaunchedEffect(vm.account?.id) { vm.loadTorrents43(); vm.loadUpcoming43() }
    val dls = s.torrents.orEmpty().filter { it.progress < 1f && it.state != "seed" }.take(3)
    val ups = s.upcoming.orEmpty().filter { it.day >= java.time.LocalDate.now().toString() }.take(2)
    PCard(onClick = { s.tab = if (dls.isNotEmpty()) "qbit" else "snart"; vm.openMedia43() }) {
        Column(Modifier.padding(16.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PLabel(if (dls.isNotEmpty()) "Media · lastes ned" else "Media", modifier = Modifier.weight(1f))
                Text("alle ›", color = p.mut, fontSize = 12.sp)
            }
            if (s.torrents == null && s.upcoming == null) Text("Henter …", color = p.mut, fontSize = 13.sp)
            dls.forEach { t ->
                val stalled = t.state == "stall" || t.state == "error"
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(t.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        Text(if (stalled) "står fast" else "${(t.progress * 100).toInt()} %", color = if (stalled) WARN43 else p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                    }
                    t.sub?.let { Text(it, color = p.mut, fontSize = 11.5.sp, maxLines = 1) }
                    Box(Modifier.fillMaxWidth().height(3.dp).clip(CircleShape).background(p.line)) {
                        Box(Modifier.fillMaxHeight().fillMaxWidth(t.progress.coerceIn(0f, 1f)).background(if (stalled) WARN43 else RED43))
                    }
                }
            }
            if (dls.isNotEmpty() && ups.isNotEmpty()) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            if (ups.isNotEmpty()) PLabel("Kommer", color = p.mut)
            ups.forEach { u ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Poster43(vm, u.poster, u.color, u.title, 26.dp, 38.dp)
                    Column(Modifier.weight(1f)) {
                        Text(u.title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val d = runCatching { java.time.LocalDate.parse(u.day) }.getOrNull()
                        val wd = d?.dayOfWeek?.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale("nb", "NO"))?.trimEnd('.')
                        Text(listOfNotNull(u.code, listOfNotNull(wd, u.time).joinToString(" ").ifBlank { null }).joinToString(" · "), color = p.mut, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

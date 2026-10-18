package no.kristo.finanshub.ui

import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import java.time.LocalDate

/*
 * Prompt 24 (A): Bursdager (design/Bursdager.dc.html, variant «mobile»), åpnes fra Mer → Bursdager, Hjem-kortet og widgetene.
 * «Neste bursdag» (rødt kort), søk og «+ Legg til», skjemaet, liste per måned med utvidbare rader, og kalendere (Google og HA).
 */

/** Trykk med kort opasitet (0,6) i stedet for Material-rippel. */
@Composable
internal fun Modifier.press24(enabled: Boolean = true, onClick: () -> Unit): Modifier {
    val src = remember { MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    return this.alpha(if (pressed) .6f else 1f).clickable(interactionSource = src, indication = null, enabled = enabled, onClick = onClick)
}

/** Valgknapp i skjemaene (32 høy, radius 16): blekk når valgt, strek ellers. */
@Composable
private fun BdChip(text: String, on: Boolean, height: Dp = 32.dp, mono: Boolean = false, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        Modifier.height(height).clip(RoundedCornerShape(height / 2)).background(if (on) p.ink else Color.Transparent)
            .border(1.dp, if (on) p.ink else p.line, RoundedCornerShape(height / 2)).press24 { Haptics.select(); onClick() }.padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = if (height < 32.dp) 12.sp else 12.5.sp,
            fontFamily = if (mono) PaperFonts.mono else PaperFonts.sans, maxLines = 1)
    }
}

/** Bryter som i designet (46 × 28, grønn når på). */
@Composable
private fun BdToggle(title: String, sub: String, on: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Column {
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(Modifier.fillMaxWidth().press24(onClick = onClick).padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f)) {
                Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                Text(sub, color = p.mut, fontSize = 12.sp)
            }
            Box(Modifier.size(46.dp, 28.dp).clip(RoundedCornerShape(14.dp)).background(if (on) p.pos else p.line).padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
                Box(Modifier.size(22.dp).clip(CircleShape).background(Color.White))
            }
        }
    }
}

@Composable
private fun BdLabel(text: String, right: String? = null) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 4.dp)) {
        Text(text, color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp, modifier = Modifier.weight(1f))
        if (right != null) Text(right, color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp)
    }
}

/** Avatar: Familie-profilbildet (avatarUrl) når det finnes, ellers initialer i fargen til «hvem». */
@Composable
internal fun BdAvatar(vm: AppViewModel, b: Bd24, size: Int) {
    var bmp by remember(b.avatarUrl) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(b.avatarUrl) { b.avatarUrl?.takeIf { it.startsWith("/") }?.let { bmp = runCatching { vm.image(it) }.getOrNull() } }
    val img = bmp
    if (img != null) Image(img.asImageBitmap(), b.name, contentScale = ContentScale.Crop, modifier = Modifier.size(size.dp).clip(CircleShape))
    else Box(Modifier.size(size.dp).clip(CircleShape).background(Color(b.color)), contentAlignment = Alignment.Center) {
        Text(b.initials, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = (size * .34f).sp, maxLines = 1)
    }
}

@Composable
internal fun BirthdaysScreen24(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val s = vm.bd24
    BackHandler { vm.closeBirthdays24() }
    LaunchedEffect(Unit) { vm.loadHaCals24() }
    LaunchedEffect(s.google.connected) { if (s.google.connected) vm.loadGoogleCals24() }
    // Etter «Logg inn med Google» i Custom Tab: spør serveren til kontoen er koblet til (maks to minutter).
    LaunchedEffect(s.authAt) { while (s.authAt != 0L) { delay(3_000); vm.pollGoogle24() } }
    val all = s.items
    val q = s.q.trim().lowercase()
    val list = (all ?: emptyList()).filter { q.isEmpty() || it.name.lowercase().contains(q) }
    // Grupper: «NESTE 30 DAGER», deretter én per måned i rullerende rekkefølge (neste år får årstallet).
    val groups = remember(list) {
        val g = mutableListOf<Pair<String, MutableList<Bd24>>>()
        val soon = list.filter { it.daysLeft <= 30 }
        if (soon.isNotEmpty()) g += "NESTE 30 DAGER" to soon.toMutableList()
        val thisYear = LocalDate.now().year
        list.filter { it.daysLeft > 30 }.forEach { b ->
            val k = BD_MN[b.next.monthValue - 1].uppercase() + if (b.next.year != thisYear) " ${b.next.year}" else ""
            (g.firstOrNull { it.first == k } ?: (k to mutableListOf<Bd24>()).also { g += it }).second += b
        }
        g
    }
    Box(Modifier.fillMaxSize().background(p.bg)) {
        LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(0.dp, 0.dp, 0.dp, 40.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()),
            verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { ModuleHero("Familie og venner", "Bursdager", "‹ Mer") { s.adding = false; s.editId = null; vm.closeBirthdays24() } }
            item { Column(Modifier.padding(horizontal = 16.dp)) { BdHero(vm, all ?: emptyList()) } }
            item { Column(Modifier.padding(horizontal = 16.dp)) { BdSearch(vm) } }
            if (s.adding) item { Column(Modifier.padding(horizontal = 16.dp)) { BdFormCard(vm) } }
            s.error?.let { e -> item { Text(e, color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp)) } }
            if (s.localOnly) item {
                Text("Serveren har ikke Bursdager ennå, så bursdagene lagres bare på denne telefonen.", color = p.mut, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 20.dp))
            }
            if (all == null && s.error == null) item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
            if (all != null && list.isEmpty()) item {
                PCard(Modifier.padding(horizontal = 16.dp)) {
                    Text(if (q.isEmpty()) "Ingen bursdager ennå. Trykk «+ Legg til»." else "Ingen treff.", color = p.mut, fontSize = 14.sp, modifier = Modifier.padding(16.dp))
                }
            }
            groups.forEach { (t, items) ->
                item(key = "g-$t") {
                    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        BdLabel(t, "${items.size}")
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(horizontal = 14.dp, vertical = 2.dp)) {
                            items.forEachIndexed { i, b -> BdRow(vm, b, i > 0) }
                        }
                    }
                }
            }
            item { Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { BdCalendars(vm, ctx) } }
            item {
                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    BdLabel("WIDGETS PÅ TELEFONEN")
                    Text("Hold inne på hjemskjermen → Widgets → FinansHub: «Bursdager» viser de tre neste, og + legger til en ny." +
                        (if (no.kristo.finanshub.widget.S24.isSamsung) " På Samsung finnes også «Bursdager · Samsung» i samme størrelse som Samsungs egne widgets." else ""),
                        color = p.mut, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
                }
            }
        }
        vm.message?.let { m ->
            Box(Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 8.dp).shadow(12.dp, CircleShape).clip(CircleShape).background(p.ink).padding(16.dp, 10.dp)) {
                Text(m, color = p.bg, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 2)
            }
        }
    }
}

/** «Neste bursdag»: rødt kort med navn, «Fyller 41 · lørdag 2. november», dager igjen stort og «Deretter: …». */
@Composable
private fun BdHero(vm: AppViewModel, all: List<Bd24>) {
    val h = all.firstOrNull() ?: return
    val same = all.filter { it.daysLeft == h.daysLeft }
    val nxt = all.filter { it.daysLeft > h.daysLeft }.take(2)
    val fg = Color.White
    Column(
        Modifier.fillMaxWidth().shadow(14.dp, RoundedCornerShape(24.dp), ambientColor = Color.Black.copy(alpha = .4f), spotColor = Color.Black.copy(alpha = .4f))
            .clip(RoundedCornerShape(24.dp)).background(Color(0xFFB23A2A)).press24 { vm.bd24.sel = h.id }.padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text(if (h.daysLeft == 0) "BURSDAG I DAG" else "NESTE BURSDAG", color = fg.copy(alpha = .9f), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp, modifier = Modifier.weight(1f))
            if (same.size == 1) Text(BD_SRC[h.source] ?: "LOKAL", color = fg.copy(alpha = .8f), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, letterSpacing = .6.sp)
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f)) {
                Text(same.joinToString(" og ") { it.name }, color = fg, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 34.sp, lineHeight = 36.sp)
                Text((if (same.size == 1 && h.age != null) "Fyller ${h.age} · " else "") + bdLong(h.next), color = fg.copy(alpha = .92f), fontSize = 14.sp, modifier = Modifier.padding(top = 4.dp))
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(if (h.daysLeft == 0) "I dag" else "${h.daysLeft}", color = fg, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Normal, fontSize = 48.sp, lineHeight = 48.sp, maxLines = 1)
                if (h.daysLeft > 0) Text(if (h.daysLeft == 1) "dag igjen" else "dager igjen", color = fg.copy(alpha = .88f), fontSize = 12.5.sp)
            }
        }
        if (nxt.isNotEmpty()) Column {
            Box(Modifier.fillMaxWidth().height(1.dp).background(fg.copy(alpha = .28f)))
            Text("Deretter: " + nxt.joinToString(" · ") { "${it.name} ${it.next.dayOfMonth}. ${BD_MS[it.next.monthValue - 1]}" }, color = fg.copy(alpha = .92f), fontSize = 13.sp, modifier = Modifier.padding(top = 10.dp))
        }
    }
}

@Composable
private fun BdSearch(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.bd24
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.weight(1f).height(46.dp).clip(CircleShape).background(p.card).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Filled.Search, null, tint = p.mut, modifier = Modifier.size(18.dp))
            BasicTextField(
                s.q, { s.q = it }, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans),
                cursorBrush = SolidColor(p.lab), modifier = Modifier.weight(1f),
                decorationBox = { inner -> Box { if (s.q.isEmpty()) Text("Søk etter navn", color = p.mut, fontSize = 15.sp, fontWeight = FontWeight.Medium); inner() } },
            )
        }
        Box(Modifier.height(46.dp).clip(CircleShape).background(p.ink).press24 { Haptics.select(); s.adding = !s.adding; s.editId = null }.padding(horizontal = 18.dp), contentAlignment = Alignment.Center) {
            Text(if (s.adding) "Lukk" else "+ Legg til", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
        }
    }
}

/** Felt i skjemaet: 44 høyt, radius 14, papirbakgrunn og strek. */
@Composable
private fun BdInput(value: String, onChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier, mono: Boolean = false, numeric: Boolean = false) {
    val p = PaperPal.current
    BasicTextField(
        value, onChange, singleLine = true,
        textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, fontFamily = if (mono) PaperFonts.mono else PaperFonts.sans),
        keyboardOptions = if (numeric) KeyboardOptions(keyboardType = KeyboardType.Number) else KeyboardOptions.Default,
        cursorBrush = SolidColor(p.lab),
        modifier = modifier.height(44.dp).clip(RoundedCornerShape(14.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp),
        decorationBox = { inner -> Box(Modifier.fillMaxHeight(), contentAlignment = Alignment.CenterStart) { if (value.isEmpty()) Text(placeholder, color = p.mut, fontSize = 15.sp, fontWeight = FontWeight.SemiBold); inner() } },
    )
}

/** Nedtrekk (dag og måned) i samme form som feltene. */
@Composable
private fun BdSelect(label: String, options: List<Pair<Int, String>>, onPick: (Int) -> Unit, modifier: Modifier = Modifier) {
    val p = PaperPal.current
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        Row(
            Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(14.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(14.dp)).press24 { open = true }.padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label, color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text("▾", color = p.mut, fontSize = 12.sp)
        }
        DropdownMenu(open, { open = false }, Modifier.heightIn(max = 320.dp).background(p.card)) {
            options.forEach { (v, n) -> DropdownMenuItem(text = { Text(n, color = p.ink, fontSize = 15.sp) }, onClick = { onPick(v); open = false }) }
        }
    }
}

/** «Ny bursdag» / «Rediger bursdag»: navn, dag, måned, år, hvem, påminnelse og «Lagre i». */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BdFormCard(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.bd24
    val edit = s.items?.firstOrNull { it.id == s.editId }
    val today = LocalDate.now()
    val defDest = if (s.google.connected) "google" else if (s.ha.entityId != null) "ha" else "local"
    var name by remember(s.editId) { mutableStateOf(edit?.name ?: "") }
    var day by remember(s.editId) { mutableStateOf(edit?.day ?: today.dayOfMonth) }
    var month by remember(s.editId) { mutableStateOf(edit?.month ?: today.monthValue) }
    var year by remember(s.editId) { mutableStateOf(edit?.year?.toString() ?: "") }
    var rel by remember(s.editId) { mutableStateOf(edit?.relation ?: "venn") }
    var rem by remember(s.editId) { mutableStateOf(if (edit != null) edit.reminderDays else 1) }
    var dest by remember(s.editId) { mutableStateOf(edit?.source ?: defDest) }
    val dests = buildList {
        if (s.google.connected) add("google" to "Google Kalender")
        if (s.ha.entityId != null && s.ha.allowed && !s.localOnly) add("ha" to "Home Assistant")
        add("local" to "Bare her")
    }
    if (dests.none { it.first == dest }) dest = "local"
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).border(1.5.dp, p.lab, RoundedCornerShape(22.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        PSerif(if (edit != null) "Rediger bursdag" else "Ny bursdag", 22.sp)
        BdInput(name, { name = it.take(60) }, "Navn", Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BdSelect("$day.", (1..31).map { it to "$it." }, { day = it }, Modifier.width(76.dp))
            BdSelect(BD_MN[month - 1], (1..12).map { it to BD_MN[it - 1] }, { month = it }, Modifier.weight(1f))
            BdInput(year, { year = it.filter(Char::isDigit).take(4) }, "År", Modifier.width(92.dp), mono = true, numeric = true)
        }
        Text("Hvem", color = p.mut, fontSize = 12.5.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            BD_RELS.forEach { (k, n) -> BdChip(n, rel == k) { rel = k } }
        }
        Text("Påminnelse", color = p.mut, fontSize = 12.5.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            BD_REMS.forEach { (v, n) -> BdChip(n, rem == v) { rem = v } }
        }
        if (edit == null) {
            Text("Lagre i", color = p.mut, fontSize = 12.5.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                dests.forEach { (k, n) -> BdChip(n, dest == k) { dest = k } }
            }
            Text(when (dest) {
                "google" -> "Lagres som årlig heldagshendelse i «${s.gCals.firstOrNull { it.id == s.google.calendarId }?.name ?: s.google.calendarId ?: "Bursdager"}»" + (s.google.email?.let { " på $it" } ?: "") + "."
                "ha" -> "Lagres i ${s.ha.entityId} via Home Assistant."
                else -> "Lagres bare i Homelab. Koble til en kalender for å synke."
            }, color = p.mut, fontSize = 12.sp, lineHeight = 17.sp)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, p.line, RoundedCornerShape(22.dp)).press24 { s.adding = false; s.editId = null }, contentAlignment = Alignment.Center) {
                Text("Avbryt", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
            Box(Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).background(p.ink).press24(enabled = s.busy != "save") { vm.saveBirthday24(BdForm24(name, day, month, year, rel, rem, dest)) },
                contentAlignment = Alignment.Center) {
                Text(if (s.busy == "save") "Lagrer …" else "Lagre", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        }
    }
}

/** Én rad: avatar, navn, «2. nov · fyller 41 · Familie», «om 15 d» (rødt ≤ 7 dager) og kildemerke. Trykk utvider raden. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BdRow(vm: AppViewModel, b: Bd24, top: Boolean) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val s = vm.bd24
    val open = s.sel == b.id
    Column(Modifier.fillMaxWidth().animateContentSize(tween(200))) {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().heightIn(min = 60.dp).press24 { Haptics.select(); s.sel = if (open) null else b.id; s.delArm = null }.padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            BdAvatar(vm, b, 42)
            Column(Modifier.weight(1f)) {
                Text(b.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(b.short + (b.age?.let { " · fyller $it" } ?: "") + " · " + b.relLabel, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(b.whenText, color = if (b.daysLeft <= 7) p.lab else p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 17.sp, maxLines = 1)
                Text(BD_SRC[b.source] ?: "LOKAL", color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.5.sp, letterSpacing = .6.sp)
            }
        }
        if (open) Column(Modifier.fillMaxWidth().padding(start = 54.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val det = bdLong(b.next).replaceFirstChar { it.uppercase() } + (b.year?.let { " · født $it" } ?: "") + " · " + if (b.daysLeft == 0) "har bursdag i dag" else "om ${b.daysLeft} dager"
            Text(det, color = p.ink, fontSize = 13.5.sp)
            Text("Påminnelse", color = p.mut, fontSize = 12.5.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                BD_REMS.forEach { (v, n) -> BdChip(n, b.reminderDays == v, height = 30.dp) { vm.setReminder24(b, v) } }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (b.source == "google") BdAction("Åpne i Google Kalender", p.ink) { openLink(ctx, b.googleUrl ?: "https://calendar.google.com/") }
                BdAction("Rediger", p.ink) { s.editId = b.id; s.adding = true }
                BdAction(if (s.delArm == b.id) "Trykk igjen for å slette" else "Slett", p.lab) { vm.deleteBirthday24(b) }
            }
        }
    }
}

@Composable
private fun BdAction(text: String, color: Color, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp)).press24(onClick = onClick).padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
        Text(text, color = color, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
    }
}

/** Google-logoen som «G» i fargene (enkelt, uten bilde). */
@Composable
private fun GoogleG(size: Int) {
    Text("G", color = Color(0xFF4285F4), fontWeight = FontWeight.ExtraBold, fontSize = (size * .9f).sp, maxLines = 1)
}

/** Kalendere: Google (logg inn, kalender, skriv nye, kontakter, synk, logg ut) og Home Assistant (calendar.*, importer, to veier). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BdCalendars(vm: AppViewModel, ctx: android.content.Context) {
    val p = PaperPal.current
    val s = vm.bd24
    val g = s.google
    BdLabel("KALENDERE")
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Color.White).border(1.dp, p.line, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) { GoogleG(20) }
            Column(Modifier.weight(1f)) {
                Text("Google Kalender", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Text(when {
                    s.localOnly -> "Trenger en nyere Homelab-server"
                    !g.configured -> "Ikke satt opp · Integrasjoner → Google Kalender"
                    g.error != null && !g.connected -> g.error
                    g.connected -> listOfNotNull(g.email, g.syncedAt?.let { "synket ${clock24(it)}" } ?: "kobler til …").joinToString(" · ")
                    s.authAt != 0L -> "Venter på innlogging i nettleseren …"
                    else -> "Ikke koblet til"
                }, color = if (g.connected) p.pos else p.mut, fontSize = 12.5.sp)
            }
        }
        if (!g.connected) {
            Row(
                Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(23.dp)).background(Color.White).border(1.dp, p.line, RoundedCornerShape(23.dp)).press24(enabled = !s.localOnly) { vm.googleLogin24(ctx) },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
            ) {
                GoogleG(18)
                Text(if (s.authAt != 0L) "Kobler til …" else "Logg inn med Google", color = Color(0xFF1F1F1F), fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
            }
        } else {
            Text("Kalender", color = p.mut, fontSize = 12.5.sp)
            val cals = s.gCals.ifEmpty { listOfNotNull(g.calendarId?.let { BdCal24(it, it) }) }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                cals.forEach { c -> BdChip(c.name, g.calendarId == c.id) { vm.googleSettings24(calendarId = c.id) } }
            }
            Column {
                BdToggle("Skriv nye bursdager til Google", "Årlig heldagshendelse med påminnelse", g.writeNew) { vm.googleSettings24(writeNew = !g.writeNew) }
                BdToggle("Hent bursdager fra Google-kontakter", "Fra kontaktlisten din", g.contacts) { vm.googleSettings24(contacts = !g.contacts) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(20.dp)).border(1.dp, p.line, RoundedCornerShape(20.dp)).press24 { vm.googleSync24() }, contentAlignment = Alignment.Center) {
                    Text(if (s.busy == "sync") "Synker …" else "↻ Synk nå", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
                }
                Box(Modifier.height(40.dp).clip(RoundedCornerShape(20.dp)).border(1.dp, p.line, RoundedCornerShape(20.dp)).press24 { vm.googleLogout24() }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                    Text("Logg ut", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
                }
            }
        }
        if (s.ha.allowed) BdHaPart(vm)
    }
    Text("Nye bursdager lagres som årlige heldagshendelser. Endringer i Google Kalender og Home Assistant hentes inn automatisk.",
        color = p.mut, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
}

/** Home Assistant-delen av Kalendere (bare administrator). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BdHaPart(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.bd24
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        val ha = s.ha
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFF18BCF2)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Home, null, tint = Color.White, modifier = Modifier.size(20.dp))
            }
            Column(Modifier.weight(1f)) {
                Text("Home Assistant", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Text(when {
                    s.localOnly -> "Trenger en nyere Homelab-server"
                    ha.error != null -> ha.error
                    ha.entityId != null -> ha.entityId + (ha.syncedAt?.let { " · importert ${clock24(it)}" } ?: "")
                    else -> "Velg kalender og importer"
                }, color = if (ha.syncedAt != null) p.pos else p.mut, fontSize = 12.5.sp)
            }
        }
        if (s.haCals.isNotEmpty()) {
            Text("Kalender i Home Assistant", color = p.mut, fontSize = 12.5.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                s.haCals.forEach { c -> BdChip(c.id, ha.entityId == c.id, mono = true) { vm.haSettings24(entityId = c.id) } }
            }
        }
        if (ha.entityId != null) Column { BdToggle("Synk to veier", "Nye bursdager her legges også i Home Assistant", ha.twoWay) { vm.haSettings24(twoWay = !ha.twoWay) } }
        Box(Modifier.fillMaxWidth().height(42.dp).clip(RoundedCornerShape(21.dp)).background(p.ink).press24(enabled = !s.localOnly) { vm.haImport24() }, contentAlignment = Alignment.Center) {
            Text(when { s.busy == "ha" -> "Importerer …"; ha.syncedAt != null -> "↻ Importer på nytt"; else -> "Importer fra Home Assistant" }, color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
        }
    }
}

/** «21:10» fra ISO-tid (i dag), ellers «2. nov». */
private fun clock24(iso: String): String {
    val t = runCatching { java.time.OffsetDateTime.parse(iso).atZoneSameInstant(java.time.ZoneId.systemDefault()) }.getOrNull()
        ?: runCatching { java.time.Instant.parse(iso).atZone(java.time.ZoneId.systemDefault()) }.getOrNull()
        ?: runCatching { java.time.Instant.ofEpochMilli(iso.toLong()).atZone(java.time.ZoneId.systemDefault()) }.getOrNull() ?: return ""
    return if (t.toLocalDate() == LocalDate.now()) t.format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")) else "${t.dayOfMonth}. ${BD_MS[t.monthValue - 1]}"
}

/* ---------------- Hjem: «BURSDAGER · NESTE» (h9) ---------------- */

/** De tre neste (avatar, navn, «2. nov · fyller 41», «om 15 d» i rødt ≤ 7 dager) og «alle ›». Trykk åpner Bursdager. */
@Composable
internal fun HomeBirthdaysCard24(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(vm.base) { if (vm.bd24.items == null) vm.loadBirthdays24(quiet = true) }
    val l = (vm.bd24.items ?: emptyList()).take(3)
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).press24 { vm.openBirthdays24() }.padding(16.dp, 14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text("BURSDAGER · " + if (l.firstOrNull()?.daysLeft == 0) "I DAG" else "NESTE", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp,
                letterSpacing = 1.3.sp, modifier = Modifier.weight(1f))
            Text("alle ›", color = p.mut, fontSize = 12.sp)
        }
        if (l.isEmpty()) Text(if (vm.bd24.items == null) "Henter bursdager …" else "Ingen bursdager ennå. Trykk for å legge til.", color = p.mut, fontSize = 13.sp)
        l.forEach { b ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                BdAvatar(vm, b, 30)
                Column(Modifier.weight(1f)) {
                    Text(b.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(b.short + (b.age?.let { " · fyller $it" } ?: ""), color = p.mut, fontSize = 12.sp, maxLines = 1)
                }
                Text(b.whenText, color = if (b.daysLeft <= 7) p.lab else p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 18.sp, maxLines = 1)
            }
        }
    }
}

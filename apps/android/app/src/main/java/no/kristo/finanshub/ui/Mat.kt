package no.kristo.finanshub.ui

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import no.kristo.finanshub.*
import java.time.LocalDate

/* ---------------- Matplan på mobil: egen flate i «matapp»-utseendet ---------------- */

/** Fargene i Matplan, lys (standard) og mørk. Følger ikke aksentfargen. */
internal data class MatPalette(
    val dark: Boolean, val bg: Color, val text: Color, val sub: Color, val muted: Color, val card: Color, val accent: Color,
    val lime: Color, val cream: Color, val border: Color, val black: Color, val onBlack: Color, val tagBg: Color, val tagFg: Color, val row: Color,
    val tiles: List<Color>, val checkOn: Color, val checkOff: Color,
) {
    companion object {
        private fun c(v: Long) = Color(v)
        val Light = MatPalette(false, c(0xFFF1F2EC), c(0xFF1E241C), c(0xFF5B6158), c(0xFF7A8077), Color.White, c(0xFFF2552C),
            c(0xFFE4F0A9), c(0xFFFBEACB), c(0xFFD9DCD2), c(0xFF1E1F1C), c(0xFFF1F2EC), c(0xFFF4DDA9), c(0xFF8A5A1E), c(0xFFF6F7F2),
            listOf(c(0xFFE4F0A9), c(0xFFFBEACB), c(0xFFDCEBE6), c(0xFFF6D9CF), c(0xFFE8E2F4)), c(0xFFC9DB7A), c(0xFFC9CDC1))
        val Night = MatPalette(true, c(0xFF141612), c(0xFFECEFE6), c(0xFFAEB4A7), c(0xFF959B8E), c(0xFF1E211B), c(0xFFFF7A55),
            c(0xFF3B4421), c(0xFF3D3323), c(0xFF363A31), c(0xFFECEFE6), c(0xFF141612), c(0xFF2C2519), c(0xFFF0B470), c(0xFF252821),
            listOf(c(0xFF3B4421), c(0xFF3D3323), c(0xFF24403A), c(0xFF4A2E26), c(0xFF36304A)), c(0xFF6A7A35), c(0xFF4A4F44))
    }
}

/** Lys, mørk eller som systemet (Innstillinger → Utseende → Matplan, eller ☾/☀ øverst). */
@Composable
internal fun matPalette(vm: AppViewModel): MatPalette = when (vm.layout.matTheme) {
    "dark" -> MatPalette.Night
    "system" -> if (isSystemInDarkTheme()) MatPalette.Night else MatPalette.Light
    else -> MatPalette.Light
}

private val shortDay = listOf("Ma", "Ti", "On", "To", "Fr", "Lø", "Sø")
private val longDay = listOf("Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag")
private val monthShort = listOf("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")
private fun dayNum(iso: String) = iso.takeLast(2).toIntOrNull() ?: 0
private fun monthIdx(iso: String) = ((iso.drop(5).take(2).toIntOrNull() ?: 1) - 1).coerceIn(0, 11)

/** «Ingrid» → «Ingrids», «Hans» → «Hans'». */
private fun owner(n: String) = if (n.endsWith("s")) "$n'" else "${n}s"

/** Første bokstav i varen, uten mengde («400 g kyllingfilet» → K). */
private val amount = Regex("""^[0-9\s.,½¼¾/]+(g|kg|dl|l|ss|ts|stk|pose|boks|fedd)?\s+""", RegexOption.IGNORE_CASE)
private fun ingInitial(s: String) = initial(s.replace(amount, "").ifBlank { s })

@Composable
internal fun MatSurface(vm: AppViewModel) {
    val p = matPalette(vm)
    // Mørke ikoner i statuslinja på den lyse flaten.
    val view = LocalView.current
    DisposableEffect(p.dark) {
        val window = (view.context as? Activity)?.window
        val ctl = window?.let { WindowCompat.getInsetsController(it, view) }
        val before = ctl?.isAppearanceLightStatusBars
        ctl?.isAppearanceLightStatusBars = !p.dark
        onDispose { if (before != null) ctl?.isAppearanceLightStatusBars = before }
    }
    val w = vm.week
    LazyColumn(
        Modifier.fillMaxSize().background(p.bg), contentPadding = PaddingValues(18.dp, 4.dp, 18.dp, 48.dp), verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        vm.topRowTitle(true)?.let { t -> item { TopBackRow(vm, t, p.text, p.card, p.border) } }
        item { MatHeader(vm, p) }
        vm.moduleError?.let { e -> item { Text(e, color = p.accent, fontSize = 13.sp) } }
        if (w == null || w.days.isEmpty()) {
            if (vm.moduleError == null) item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.text) } }
        } else {
            val todayIso = LocalDate.now().toString()
            val ti = w.days.indexOfFirst { it.today || it.date == todayIso }.coerceAtLeast(0)
            val sel = (vm.matDay ?: ti).coerceIn(0, w.days.size - 1)
            val d = w.days[sel]
            val dish = w.dishes.firstOrNull { it.id == d.dishId } ?: w.dishes.firstOrNull { it.name == d.name }
            val ing = d.ingredients.ifEmpty { dish?.ing ?: emptyList() }
            val steps = dish?.steps ?: emptyList()
            val today = w.days[ti]
            item { Text(weekLabel(w), color = p.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.8.sp) }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.height(IntrinsicSize.Min)) {
                    Mini("I dag", today.name ?: "Ingen rett", "${longDay[ti % 7].take(3)} ${dayNum(today.date)}. ${monthShort[monthIdx(today.date)]}", p.lime, p, Modifier.weight(1f))
                    Mini("Kokk i dag", today.cook ?: "–", null, p.cream, p, Modifier.weight(1f))
                    Mini("Faste dager", "${w.days.count { it.fixed }}", null, p.card, p, Modifier.weight(1f))
                }
            }
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    w.days.forEachIndexed { i, day ->
                        val on = i == sel
                        Box(
                            Modifier.height(40.dp).clip(CircleShape).background(if (on) p.black else Color.Transparent).border(1.dp, if (on) p.black else p.border, CircleShape)
                                .clickable(role = Role.Tab) { vm.matDay = i }.semantics { selected = on }.padding(horizontal = 16.dp),
                            contentAlignment = Alignment.Center,
                        ) { Text("${shortDay[i % 7]} ${dayNum(day.date)}", color = if (on) p.onBlack else p.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp) }
                    }
                }
            }
            item { DayCard(vm, d, sel, sel == ti, ing.size, steps.size, p) }
            item {
                MatSection("Ingredienser", if (ing.size == 1) "1 ingrediens" else "${ing.size} ingredienser", p) {
                    if (ing.isEmpty()) Text("Ingen ingredienser lagt inn for denne retten.", color = p.muted, fontSize = 14.sp)
                    ing.forEachIndexed { i, n ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.row).padding(8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Box(Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(p.tiles[i % p.tiles.size]), contentAlignment = Alignment.Center) {
                                Text(ingInitial(n), color = p.text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            }
                            Text(n, color = p.text, modifier = Modifier.weight(1f))
                        }
                    }
                    if (ing.isNotEmpty()) {
                        val have = w.shopping.map { it.text.lowercase() }.toSet()
                        val all = ing.all { it.lowercase() in have }
                        MatPill(if (all) "✓ I listen" else "Legg i handlelisten", p) { vm.addToShop(ing) }
                    }
                }
            }
            if (steps.isNotEmpty()) item {
                MatSection("Slik gjør du", "${steps.size} steg", p) {
                    steps.forEachIndexed { i, t ->
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Box(Modifier.size(28.dp).clip(CircleShape).background(p.black), contentAlignment = Alignment.Center) {
                                Text("${i + 1}", color = p.onBlack, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            }
                            Text(t, color = p.text, modifier = Modifier.weight(1f).padding(top = 3.dp))
                        }
                    }
                }
            }
            item {
                MatSection("Handleliste", "${w.shopping.count { !it.done }} igjen", p) {
                    if (w.shopping.isEmpty()) Text("Handlelisten er tom.", color = p.muted, fontSize = 14.sp)
                    w.shopping.forEach { sh ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable(role = Role.Checkbox) { vm.toggleShop(sh.id) }.semantics { selected = sh.done }.padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Box(Modifier.size(24.dp).clip(RoundedCornerShape(7.dp)).background(if (sh.done) p.lime else Color.Transparent)
                                .border(1.5.dp, if (sh.done) p.checkOn else p.checkOff, RoundedCornerShape(7.dp)), contentAlignment = Alignment.Center) {
                                if (sh.done) Text("✓", color = p.text, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            }
                            Text(sh.text, color = if (sh.done) p.muted else p.text, textDecoration = if (sh.done) TextDecoration.LineThrough else null)
                        }
                    }
                }
            }
            item { MatPill("Se hele uka og alle retter", p) { vm.matFull = true } }
        }
    }
}

@Composable
private fun MatHeader(vm: AppViewModel, p: MatPalette) {
    val first = vm.displayName.split(' ').firstOrNull().orEmpty()
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f)) {
            Text(if (first.isBlank()) "Hei" else "Hei, $first", color = p.sub, fontSize = 15.sp)
            Text("Middag denne uka", color = p.text, fontSize = 30.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Box(
            Modifier.size(44.dp).clip(CircleShape).background(p.card).border(1.dp, p.border, CircleShape)
                .clickable(role = Role.Button) { vm.setMatTheme(if (p.dark) "light" else "dark") }
                .semantics { contentDescription = if (p.dark) "Bytt til lyst utseende" else "Bytt til mørkt utseende" },
            contentAlignment = Alignment.Center,
        ) { Text(if (p.dark) "☀" else "☾", color = p.text, fontSize = 18.sp) }
        Box(
            Modifier.size(44.dp).clip(CircleShape).background(p.black).clickable(role = Role.Button) { vm.planWeek() }.semantics { contentDescription = "Ny ukeplan" },
            contentAlignment = Alignment.Center,
        ) { Text("✦", color = p.onBlack, fontSize = 18.sp, fontWeight = FontWeight.Bold) }
        if (vm.topRowTitle(true) == null) Avatar(vm)
    }
}

private fun weekLabel(w: Week): String {
    val s = w.start.ifBlank { w.days.firstOrNull()?.date ?: return "" }
    val e = w.end ?: w.days.lastOrNull()?.date ?: s
    val n = w.week?.let { "UKE $it · " } ?: ""
    return n + "${dayNum(s)}.–${dayNum(e)}. ${monthShort[monthIdx(e)].uppercase()}"
}

@Composable
private fun Mini(title: String, value: String, sub: String?, bg: Color, p: MatPalette, modifier: Modifier) {
    Column(
        modifier.fillMaxHeight().heightIn(min = 96.dp).clip(RoundedCornerShape(24.dp)).background(bg)
            .then(if (bg == p.card) Modifier.border(1.dp, p.border, RoundedCornerShape(24.dp)) else Modifier).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(title, color = p.sub, fontSize = 12.sp, maxLines = 1)
        Text(value, color = p.text, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        sub?.let { Text(it, color = p.muted, fontSize = 11.sp, maxLines = 1) }
    }
}

@Composable
private fun DayCard(vm: AppViewModel, d: Day, sel: Int, isToday: Boolean, ing: Int, steps: Int, p: MatPalette) {
    val tag = when {
        d.tag == "best" -> d.bestCook?.let { "★ ${owner(it)} beste" }
        d.tag == "hellofresh" || d.source == "hellofresh" -> "HelloFresh"
        else -> null
    }
    var pick by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(30.dp)).background(p.cream).padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text((longDay[sel % 7] + if (isToday) " · i dag" else "").uppercase(), color = p.sub, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp, modifier = Modifier.weight(1f))
            Box(
                Modifier.size(38.dp).clip(CircleShape).background(p.black).clickable(role = Role.Button) { vm.planDay(d.date) }.semantics { contentDescription = "Foreslå en annen rett" },
                contentAlignment = Alignment.Center,
            ) { Text("✦", color = p.onBlack, fontSize = 16.sp, fontWeight = FontWeight.Bold) }
        }
        Text(d.name ?: "Ingen rett ennå", color = if (d.name == null) p.muted else p.text, fontSize = 28.sp, fontWeight = FontWeight.Bold, lineHeight = 32.sp)
        tag?.let { Text(it, color = p.tagFg, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clip(CircleShape).background(p.tagBg).padding(10.dp, 5.dp)) }
        Box {
            Text("$ing ingredienser · $steps steg · ${d.cook ?: "ingen kokk"}", color = p.sub, fontSize = 14.sp,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(onClickLabel = "Velg kokk") { pick = true })
            DropdownMenu(expanded = pick, onDismissRequest = { pick = false }) {
                vm.week?.cooks?.forEach { c -> DropdownMenuItem(text = { Text(c) }, onClick = { pick = false; vm.setCook(d.date, c) }) }
            }
        }
    }
}

@Composable
private fun MatSection(title: String, sub: String, p: MatPalette, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(p.card)
            .then(if (p.dark) Modifier else Modifier.border(1.dp, p.border.copy(alpha = .6f), RoundedCornerShape(28.dp))).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(title, color = p.text, fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text(sub, color = p.muted, fontSize = 13.sp)
        }
        content()
    }
}

@Composable
private fun MatPill(title: String, p: MatPalette, onClick: () -> Unit) {
    Box(Modifier.fillMaxWidth().heightIn(min = 50.dp).clip(CircleShape).background(p.black).clickable(role = Role.Button, onClick = onClick), contentAlignment = Alignment.Center) {
        Text(title, color = p.onBlack, fontWeight = FontWeight.SemiBold)
    }
}

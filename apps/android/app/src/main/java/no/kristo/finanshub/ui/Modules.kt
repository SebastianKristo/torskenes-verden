package no.kristo.finanshub.ui

import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/* ---------------- Felles for modulene ---------------- */

/** Tittel med tilbakeknapp og profilbildet (menyen med Andre OS). */
@Composable
internal fun ModuleHeader(vm: AppViewModel, title: String, back: (() -> Unit)? = null, actions: @Composable RowScope.() -> Unit = {}) {
    // Papir: tittelen og tilbakeveien står i fotovinduet øverst, så bare knappene på siden vises her.
    if (LocalTopRow.current) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End), verticalAlignment = Alignment.CenterVertically) { actions() }
        return
    }
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        // Med toppraden («‹ Homelab») står tilbakeveien der.
        if (back != null || !LocalTopRow.current) FilledTonalIconButton(onClick = back ?: { vm.back(); Unit }, modifier = Modifier.size(44.dp)) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Tilbake") }
        Text(title, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        actions()
        Avatar(vm)
    }
}

@Composable
internal fun Kpi(label: String, value: String, modifier: Modifier, shape: RoundedCornerShape = RoundedCornerShape(24.dp), bg: Color = C.surface2, fg: Color = C.text, sub: String? = null) {
    Column(modifier.clip(shape).background(bg).padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, color = fg.copy(alpha = .75f), fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        // Hele tallet vises: teksten krymper i stedet for å kuttes eller få «…».
        FitText(value, fg, 20.sp, FontWeight.SemiBold, family = Mono)
        sub?.let { Text(it, color = fg.copy(alpha = .7f), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
    }
}

@Composable
internal fun Chip(text: String, bg: Color = C.surface2, fg: Color = C.text2) =
    Text(text, fontSize = 12.sp, color = fg, maxLines = 1, modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(bg).padding(8.dp, 4.dp))

private val fieldColors: TextFieldColors @Composable get() = TextFieldDefaults.colors(focusedContainerColor = C.surface2, unfocusedContainerColor = C.surface2, focusedIndicatorColor = C.primary, focusedLabelColor = C.primary)

@Composable
private fun Field(label: String, value: String, modifier: Modifier = Modifier.fillMaxWidth(), number: Boolean = false, onChange: (String) -> Unit) {
    TextField(value, onChange, label = { Text(label) }, singleLine = true, modifier = modifier, shape = RoundedCornerShape(16.dp, 16.dp, 4.dp, 4.dp), colors = fieldColors,
        keyboardOptions = KeyboardOptions(keyboardType = if (number) KeyboardType.Decimal else KeyboardType.Text))
}

/* ---------------- Subscription OS ---------------- */

private val cycles = listOf("monthly" to "Månedlig", "yearly" to "Årlig", "biennial" to "Hvert 2. år")

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SubScreen(vm: AppViewModel) {
    val s = vm.subs
    var adding by remember { mutableStateOf(false) }
    Page {
        item { ModuleHeader(vm, "Subscription OS", actions = { IconButton(onClick = { adding = !adding }) { Icon(if (adding) Icons.Filled.Close else Icons.Filled.Add, "Legg til abonnement") } }) }
        vm.moduleError?.let { e -> item { Empty(e) } }
        if (s == null && vm.moduleError == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) } }
        if (s != null) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Kpi("Per måned", "${n0(s.monthly)} kr", Modifier.weight(1f), RoundedCornerShape(28.dp, 8.dp, 8.dp, 28.dp))
                    Kpi("Per år", "${n0(s.yearly)} kr", Modifier.weight(1f), RoundedCornerShape(8.dp, 28.dp, 28.dp, 8.dp))
                }
            }
            item { Kpi("Lite brukt, kan sies opp", "${n0(s.lowUse)} kr/mnd", Modifier.fillMaxWidth(), RoundedCornerShape(28.dp), tc(0xFF3A2416), C.accentLight) }
        }
        if (adding) item {
            var name by remember { mutableStateOf("") }
            var plan by remember { mutableStateOf("") }
            var price by remember { mutableStateOf("") }
            var cycle by remember { mutableStateOf("monthly") }
            var next by remember { mutableStateOf("") }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(C.surface1).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Nytt abonnement", style = MaterialTheme.typography.titleMedium)
                Field("Tjeneste", name) { name = it }
                Field("Plan", plan) { plan = it }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field("kr per trekk", price, Modifier.weight(1f), number = true) { price = it }
                    Field("Neste trekk (dd.mm)", next, Modifier.weight(1f)) { next = it }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    cycles.forEach { (k, n) -> FilterChip(selected = cycle == k, onClick = { cycle = k }, label = { Text(n) }, colors = FilterChipDefaults.filterChipColors(selectedContainerColor = C.container, selectedLabelColor = C.onContainer)) }
                }
                val p = price.replace(" ", "").replace(',', '.').toDoubleOrNull()
                if (p != null) Text(when (cycle) { "yearly" -> "= ${n0(p / 12)} kr/mnd · ${n0(p)} kr/år"; "biennial" -> "= ${n0(p / 24)} kr/mnd · ${n0(p / 2)} kr/år"; else -> "= ${n0(p)} kr/mnd · ${n0(p * 12)} kr/år" }, color = C.text2, fontSize = 13.sp)
                Button(onClick = { vm.addSub(name, plan, price, cycle, next); adding = false }, enabled = name.isNotBlank() && p != null, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text("Legg til", fontWeight = FontWeight.Bold) }
                Text("Fra kvittering eller transaksjoner: bruk FinansHub på PC.", color = C.text2, fontSize = 12.sp)
            }
        }
        if (s != null) {
            if (s.items.isEmpty()) item { Empty("Ingen abonnementer ennå.") }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    s.items.forEachIndexed { i, sub ->
                        var menu by remember { mutableStateOf(false) }
                        Row(Modifier.fillMaxWidth().clip(itemShape(i, s.items.size)).background(C.surface1).clickable { menu = true }.padding(16.dp, 12.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Logo(vm, sub.domain, sub.name, 0xFFFF7A3D, 36)
                            Column(Modifier.weight(1f)) {
                                Text(sub.name + (sub.plan?.let { " · $it" } ?: ""), fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(listOfNotNull(sub.nextDate?.let { "Neste ${ddmm(it)}" }, sub.usageNote, cycles.firstOrNull { it.first == sub.cycle }?.second).joinToString(" · "),
                                    color = if (sub.lowUse) C.accentLight else C.text2, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                AiLine(sub.aiShort)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(n0(sub.price), fontFamily = Mono, fontWeight = FontWeight.SemiBold)
                                Chip(if (!sub.active) "Sagt opp" else if (sub.lowUse) "Si opp" else "Aktiv",
                                    bg = if (!sub.active) C.surface3 else if (sub.lowUse) tc(0xFF3A2416) else C.positiveBg,
                                    fg = if (!sub.active) C.text2 else if (sub.lowUse) C.accentLight else C.positive)
                            }
                            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                if (sub.active) DropdownMenuItem(text = { Text("Marker som sagt opp") }, onClick = { menu = false; vm.setSubActive(sub, false) })
                                else DropdownMenuItem(text = { Text("Aktiver igjen") }, onClick = { menu = false; vm.setSubActive(sub, true) })
                            }
                        }
                    }
                }
            }
        }
    }
}

/* ---------------- Boliger (delte mapper) ---------------- */

/* Finn-handler: se Finn.kt (design 2a). */

/* ---------------- Mat ---------------- */

private val sourceLabel = mapOf("gemini" to "Gemini", "hellofresh" to "HelloFresh", "fixed" to "Fast", "own" to "Egen")

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun MatScreen(vm: AppViewModel) {
    val w = vm.week
    val today = java.time.LocalDate.now().toString()
    Page {
        item { ModuleHeader(vm, "Hele uka", back = { vm.matFull = false }) }
        vm.moduleError?.let { e -> item { Empty(e) } }
        item {
            Button(onClick = { vm.planWeek() }, modifier = Modifier.fillMaxWidth().height(56.dp), shape = RoundedCornerShape(28.dp),
                colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text("✦ Ny ukeplan med Gemini", fontWeight = FontWeight.Bold) }
        }
        if (w == null && vm.moduleError == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) } }
        else if (w != null) {
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
                        FilledTonalIconButton(onClick = { vm.planDay(d.date) }, modifier = Modifier.semantics { contentDescription = "Lag plan for dagen med Glimt" }) { Text("✦") }
                    }
                }
            }
            if (w.shopping.isNotEmpty()) {
                item { SectionLabel("Handleliste") }
                item { ShoppingList(vm, w) }
            }
            if (w.dishes.isNotEmpty()) {
                item { SectionLabel("Alle retter") }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        w.dishes.forEachIndexed { i, dish ->
                            Row(Modifier.fillMaxWidth().clip(itemShape(i, w.dishes.size)).background(C.surface1).padding(16.dp, 12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(dish.name, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(listOfNotNull(if (dish.src == "hellofresh") "HelloFresh" else null, "${dish.ing.size} ingredienser",
                                        dish.days.takeIf { it.isNotEmpty() }?.joinToString(", ") { listOf("ma", "ti", "on", "to", "fr", "lø", "sø").getOrElse(it) { "?" } }?.let { "Brukes $it" }).joinToString(" · "),
                                        color = C.text2, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                                if (dish.cost > 0) Text("${n0(dish.cost)} kr", fontFamily = Mono, color = C.text2)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun ShoppingList(vm: AppViewModel, w: Week) {
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
internal fun ShoppingPane(vm: AppViewModel) {
    val w = vm.week ?: return Empty("Laster …")
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Handleliste", style = MaterialTheme.typography.headlineMedium)
        if (w.shopping.isEmpty()) Empty("Handlelisten er tom.") else ShoppingList(vm, w)
    }
}

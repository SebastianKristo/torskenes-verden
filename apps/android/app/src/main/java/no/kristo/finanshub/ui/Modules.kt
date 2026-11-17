package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.selection.toggleable

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

/* ---------------- Subscription OS ---------------- */

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
            Row(Modifier.fillMaxWidth().clip(itemShape(i, w.shopping.size)).background(C.surface1).toggleable(value = sh.done, role = Role.Checkbox) { vm.toggleShop(sh.id) }.padding(8.dp, 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = sh.done, onCheckedChange = null, colors = CheckboxDefaults.colors(checkedColor = C.primary, checkmarkColor = C.onPrimary))
                Text(sh.text, color = if (sh.done) C.text2 else C.text)
            }
        }
    }
}

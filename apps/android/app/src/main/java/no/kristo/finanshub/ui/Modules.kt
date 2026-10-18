package no.kristo.finanshub.ui

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

private val roleLabel = mapOf("owner" to "Eier", "editor" to "Kan redigere", "edit" to "Kan redigere", "viewer" to "Kan se", "view" to "Kan se", "member" to "Medlem")

@Composable
internal fun FoldersScreen(vm: AppViewModel) {
    val d = vm.folder
    if (d != null) { FolderView(vm, d); return }
    val list = vm.folders
    Page {
        item { ModuleHeader(vm, "Boliger") }
        item { Text("Boliger, hytter og felles utgifter. Brukere ser bare mapper de er medlem av.", color = C.text2, fontSize = 13.sp, modifier = Modifier.padding(start = 8.dp)) }
        vm.moduleError?.let { e -> item { Empty(e) } }
        if (list == null && vm.moduleError == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) } }
        if (list != null && list.isEmpty()) item { Empty("Ingen boliger ennå. Opprett en i FinansHub på PC.") }
        if (list != null) items(list, key = { it.id }) { f ->
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(C.surface1).clickable { vm.openFolder(f.id) }.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(C.container), contentAlignment = Alignment.Center) {
                    Icon(if (f.type == "Hytte") Icons.Filled.Landscape else Icons.Filled.Home, null, tint = C.onContainer)
                }
                Column(Modifier.weight(1f)) {
                    Text(f.name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(listOfNotNull(f.type, f.address, f.members.joinToString(", ") { it.name }.ifBlank { null }).joinToString(" · "), color = C.text2, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text("${n0(f.total)} kr", fontFamily = Mono, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FolderView(vm: AppViewModel, d: FolderDetail) {
    val f = d.folder
    val readOnly = f.myRole == "viewer" || f.myRole == "view"
    var adding by remember { mutableStateOf(false) }
    Page {
        item { ModuleHeader(vm, f.name, back = { vm.folder = null }, actions = { if (!readOnly) IconButton(onClick = { adding = !adding }) { Icon(if (adding) Icons.Filled.Close else Icons.Filled.Add, "Legg til utgift") } }) }
        item {
            Text(listOfNotNull(f.type, f.address, f.myRole?.let { roleLabel[it] ?: it }).joinToString(" · ").ifBlank { "${f.members.size} medlemmer" }, color = C.text2, fontSize = 13.sp, modifier = Modifier.padding(start = 8.dp))
        }
        if (readOnly) item {
            Text("Du har lesetilgang. Be en eier om redigeringstilgang for å legge til utgifter.", color = C.onContainer, fontSize = 13.sp,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(C.container).padding(14.dp))
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Kpi("Totalt", "${n0(f.total)} kr", Modifier.weight(1f), RoundedCornerShape(28.dp, 8.dp, 8.dp, 28.dp), C.primary, C.onPrimary)
                Kpi("Poster", "${f.count}", Modifier.weight(1f), RoundedCornerShape(8.dp, 28.dp, 28.dp, 8.dp))
            }
        }
        if (d.balances.isNotEmpty()) item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SectionLabel("Fordeling")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    d.balances.forEach { b ->
                        Chip("${b.name} ${if (b.balance >= 0) "+" else "−"}${n0(b.balance)} kr", bg = if (b.balance >= 0) C.positiveBg else tc(0xFF3A2416), fg = if (b.balance >= 0) C.positive else C.accentLight)
                    }
                }
            }
        }
        if (adding && !readOnly) item {
            var desc by remember { mutableStateOf("") }
            var amount by remember { mutableStateOf("") }
            var payer by remember { mutableStateOf<String?>(null) }
            var target by remember(f.id) { mutableStateOf(f.id) }
            var cat by remember { mutableStateOf<Int?>(null) }
            LaunchedEffect(Unit) { vm.loadBoligCategories() }
            // «Legg i bolig»: bare boliger der du kan redigere. Standard er boligen du står i.
            val targets = vm.folders.orEmpty().filter { it.myRole != "viewer" && it.myRole != "view" }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(C.surface1).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Ny utgift", style = MaterialTheme.typography.titleMedium)
                Field("Beskrivelse", desc) { desc = it }
                Field("Beløp", amount, number = true) { amount = it }
                if (targets.size > 1) {
                    Text("Legg i bolig", color = C.text2, fontSize = 13.sp)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        targets.forEach { t -> FilterChip(selected = target == t.id, onClick = { target = t.id; vm.uploadFolder = t.id }, label = { Text(t.name) }) }
                    }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    f.members.forEach { m -> FilterChip(selected = payer == m.name, onClick = { payer = m.name }, label = { Text("Betalt av ${m.name}") }) }
                }
                Text("Kategori", color = C.text2, fontSize = 13.sp)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = cat == null, onClick = { cat = null }, label = { Text("✦ La AI velge") })
                    vm.boligCats.forEach { c ->
                        FilterChip(selected = cat == c.id, onClick = { cat = c.id }, label = { Text((if (c.ai) "✦ " else "") + c.name) })
                        c.children.forEach { k -> FilterChip(selected = cat == k.id, onClick = { cat = k.id }, label = { Text("${c.name} › ${k.name}") }) }
                    }
                }
                Button(onClick = { vm.addFolderEntry(desc, amount, payer, target, cat); adding = false }, enabled = desc.isNotBlank() && amount.isNotBlank(), modifier = Modifier.fillMaxWidth().height(52.dp),
                    shape = RoundedCornerShape(26.dp), colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text("Legg til", fontWeight = FontWeight.Bold) }
                Text("Skann her inne legger kvitteringen i boligen du har valgt, og AI velger kategori og underkategori.", color = C.text2, fontSize = 12.sp)
            }
        }
        if (d.categories.isNotEmpty()) item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SectionLabel("Kategorier")
                val max = d.categories.maxOf { it.amount }.coerceAtLeast(1.0)
                d.categories.forEach { c ->
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(C.surface1).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row { Text(c.name, Modifier.weight(1f)); Text("${n0(c.amount)} kr", fontFamily = Mono) }
                        LinearProgressIndicator(progress = { (c.amount / max).toFloat() }, Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)), color = C.primary, trackColor = C.surface2)
                        // Fordeling på underkategorier («Hage og uteområde › Blomster»).
                        c.children.forEach { (n, a) ->
                            Row(Modifier.padding(start = 12.dp)) { Text("› $n", Modifier.weight(1f), color = C.text2, fontSize = 13.sp); Text("${n0(a)} kr", fontFamily = Mono, color = C.text2, fontSize = 13.sp) }
                        }
                    }
                }
            }
        }
        if (d.projects.isNotEmpty()) {
            item { SectionLabel("Prosjekter") }
            items(d.projects, key = { "p" + it.id + it.name }) { p ->
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(C.surface1).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row { Text(p.name, Modifier.weight(1f), fontWeight = FontWeight.SemiBold); Text("${n0(p.spent)} / ${n0(p.budget)}", fontFamily = Mono, color = C.text2) }
                    p.vendor?.let { Text(it, color = C.text2, fontSize = 13.sp) }
                    if (p.budget > 0) LinearProgressIndicator(progress = { (p.spent / p.budget).toFloat().coerceIn(0f, 1f) }, Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)), color = C.primary, trackColor = C.surface2)
                    Text("${n0(maxOf(0.0, p.budget - p.spent))} kr gjenstår", color = C.text2, fontSize = 13.sp)
                    p.installments.forEach { ins ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(if (ins.paid) Icons.Filled.CheckCircle else Icons.Filled.Schedule, null, tint = if (ins.paid) C.positive else C.accentLight, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(ins.label + (ins.due?.let { " · ${ddmm(it)}" } ?: ""), Modifier.weight(1f), fontSize = 14.sp)
                            Text(n0(ins.amount), fontFamily = Mono, fontSize = 14.sp)
                        }
                    }
                }
            }
        }
        if (d.bills.isNotEmpty()) {
            item { SectionLabel("Faste regninger") }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    d.bills.forEachIndexed { i, b ->
                        Row(Modifier.fillMaxWidth().clip(itemShape(i, d.bills.size)).background(C.surface1).padding(16.dp, 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(b.name, fontWeight = FontWeight.Medium)
                                Text(listOfNotNull(b.freq, b.payer?.let { "betales av $it" }, b.lastPaid?.let { "sist ${ddmm(it)}" }).joinToString(" · "), color = C.text2, fontSize = 13.sp)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                b.amount?.let { Text(n0(it), fontFamily = Mono) }
                                b.nextDue?.let { Text("neste ${ddmm(it)}", color = C.accentLight, fontSize = 12.sp) }
                            }
                        }
                    }
                }
            }
        }
        item { SectionLabel("Utgifter") }
        if (d.entries.isEmpty()) item { Empty("Ingen utgifter i mappen ennå.") }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                d.entries.forEachIndexed { i, e ->
                    Row(Modifier.fillMaxWidth().clip(itemShape(i, d.entries.size)).background(C.surface1).padding(16.dp, 12.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Logo(vm, e.domain, e.description, 0xFFFF7A3D, 36)
                        Column(Modifier.weight(1f)) {
                            Text(e.description, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(listOfNotNull(ddmm(e.date), e.paidBy?.let { "betalt av $it" }, e.split, e.categoryPath).joinToString(" · "), color = C.text2, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            AiLine(e.aiShort)
                        }
                        Text(n2(e.amount), fontFamily = Mono, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

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
                        FilledTonalIconButton(onClick = { vm.planDay(d.date) }) { Text("✦") }
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

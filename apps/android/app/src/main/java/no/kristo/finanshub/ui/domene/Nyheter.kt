@file:JvmName("DomeneNyheter")

package no.kristo.finanshub.ui

import androidx.compose.runtime.saveable.rememberSaveable
import android.content.Context
import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import no.kristo.finanshub.*

/*
 * Nyheter: kode som lå i blandingsfilene (Ui40.kt, Ui46b.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/* ======================= Nyheter: Glimt-siden ======================= */

/** Øverste kort i Nyhetsleseren: «✦ GLIMT · SAMMENDRAG» (kort ingress) → «Les hele sammendraget med kilder og bilder ›». */
@Composable
internal fun NewsGlimtEntry40(vm: AppViewModel, lead: String?) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(bottom = 10.dp).clip(RoundedCornerShape(18.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(18.dp))
        .clickable(role = Role.Button, onClickLabel = "Åpne Glimt-sammendraget") { Haptics.tap(); vm.openNewsGlimt40() }.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PLabel("✦ GLIMT · SAMMENDRAG", p.lab)
        lead?.takeIf { it.isNotBlank() }?.let { PSerif(it, 18.sp, p.ink, italic = true, weight = FontWeight.Normal, maxLines = 4) }
        Text("Les hele sammendraget med kilder og bilder ›", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
    }
}

@Composable
internal fun NewsGlimt40Page(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p40
    val ctx = LocalContext.current
    BackHandler { if (s.ngPick) s.ngPick = false else { vm.stopSay35(); s.newsGl = false } }
    LaunchedEffect(Unit) { vm.runNewsGlimt40() }
    val g = s.ng
    Box(Modifier.fillMaxSize().background(p.bg).clickable(remember { MutableInteractionSource() }, null) {}) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().padding(18.dp, 10.dp, 18.dp, 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill40("‹ Nyheter") { vm.stopSay35(); s.newsGl = false }
                Spacer(Modifier.weight(1f))
                if (g != null) Pill40(if (vm.p35.speaking != null) "■ Stopp" else "▶ Les opp") {
                    if (vm.p35.speaking != null) vm.stopSay35() else vm.say35(listOf(g.title, g.lead).plus(g.sections.flatMap { sx -> listOf(sx.h) + sx.text.map { it.first } }).joinToString(". "), "glimt", force = true)
                }
                Pill40("Innhold") { s.ngPick = true }
            }
            PLabel("✦ GLIMT · NYHETSOPPSUMMERING", p.lab)
            if (s.ngBusy && g == null) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                GlimtFig35("glimt", 40.dp, "talk"); Text("Glimt leser sakene …", color = p.mut, fontSize = 14.sp)
            }
            s.ngErr?.let { Text(it, color = p.lab, fontSize = 13.5.sp) }
            if (g == null && !s.ngBusy && s.ngErr == null) Text("Ingen saker passer valgene. Trykk «Innhold» og velg flere kilder eller en lengre periode.", color = p.mut, fontSize = 14.sp)
            if (g != null) {
                PSerif(g.title, 34.sp)
                val now = java.time.LocalDate.now()
                Text(listOf("${now.dayOfMonth}. ${MON40[now.monthValue - 1]}", "${g.count} saker", "${g.refs.map { it.source }.distinct().size} kilder", if (s.ngSel.length == "lang") "langt" else "kort").joinToString(" · "),
                    color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp)
                if (g.lead.isNotBlank()) PSerif(g.lead, 19.sp, p.sub, italic = true, weight = FontWeight.Normal)
                val long = s.ngSel.length == "lang"
                g.sections.forEachIndexed { i, sx ->
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(sx.h, color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 22.sp)
                        if (sx.image != null && (long || i < 3)) {
                            NewsImage27(vm, sx.image, g.refs.firstOrNull { it.n == sx.imageRef }?.source ?: "", Modifier.fillMaxWidth().aspectRatio(if (i == 0) 16f / 9f else 3f / 2f), 14.dp, 22)
                            sx.imageRef?.let { n -> Text("Bilde fra saken [$n] · ${g.refs.firstOrNull { it.n == n }?.source ?: ""}", color = p.mut, fontSize = 11.5.sp) }
                        }
                        sx.text.forEach { (tx, refs) ->
                            FlowRow40 {
                                Text(tx, color = p.ink, fontSize = 15.sp, lineHeight = 22.sp)
                                refs.forEach { n -> RefChip40(n) { openRef40(vm, ctx, g.refs.firstOrNull { it.n == n }) } }
                            }
                        }
                    }
                }
                if (g.refs.isNotEmpty()) {
                    PLabel("KILDER", p.mut)
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card)) {
                        g.refs.forEachIndexed { i, r ->
                            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                            Row(Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = "Åpne saken") { openRef40(vm, ctx, r) }.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("[${r.n}]", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                                NewsImage27(vm, r.image, r.source, Modifier.size(44.dp), 8.dp, 13)
                                Column(Modifier.weight(1f)) {
                                    Text(r.title, color = p.ink, fontSize = 13.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                    Text(listOfNotNull(r.source, r.time).joinToString(" · "), color = p.mut, fontSize = 11.5.sp)
                                }
                            }
                        }
                    }
                }
                Text("Laget av Glimt kl. ${hlClock40(g.updatedAt) ?: java.time.LocalTime.now().let { "%02d:%02d".format(it.hour, it.minute) }} fra kildene du har valgt. Trykk på et tall for å lese saken." +
                    if (g.local) " (Uten AI: titlene gruppert per tema.)" else "", color = p.mut, fontSize = 12.sp, lineHeight = 17.sp)
            }
        }
    }
}

@Composable
private fun Pill40(t: String, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.height(34.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).clickable(role = Role.Button) { onClick() }.padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center) { Text(t, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1) }
}

@Composable
private fun RefChip40(n: Int, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.padding(start = 3.dp, top = 2.dp).height(20.dp).clip(RoundedCornerShape(6.dp)).background(p.surf2).clickable(role = Role.Button, onClickLabel = "Les sak $n") { onClick() }.padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center) { Text("$n", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FlowRow40(content: @Composable () -> Unit) {
    FlowRow(verticalArrangement = Arrangement.spacedBy(2.dp)) { content() }
}

private fun openRef40(vm: AppViewModel, ctx: Context, r: NgRef40?) {
    r ?: return
    val item = vm.news?.items?.firstOrNull { it.url == r.url || it.title == r.title }
    if (item != null) vm.openArticle27(item) else r.url?.let { openLink(ctx, it) }
}

/** «Innhold»: kilder, temaer, periode og lengde → «✦ Lag sammendrag (N saker)». */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun NgPicker40(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p40
    var sel by remember { mutableStateOf(s.ngSel) }
    val feeds = vm.news?.feeds?.filter { it.enabled } ?: emptyList()
    ModalBottomSheet(onDismissRequest = { s.ngPick = false }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(18.dp, 0.dp, 18.dp, 34.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif("Innhold", 26.sp)
            PLabel("KILDER", p.mut)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                PChip("Alle", sel.sources.isEmpty()) { sel = sel.copy(sources = emptySet()) }
                feeds.forEach { f -> PChip(f.name, f.id in sel.sources) { sel = sel.copy(sources = if (f.id in sel.sources) sel.sources - f.id else sel.sources + f.id) } }
            }
            PLabel("TEMAER", p.mut)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                PChip("Alle", sel.topics.isEmpty()) { sel = sel.copy(topics = emptySet()) }
                NG_TOPICS40.forEach { (k, n) -> PChip(n, k in sel.topics) { sel = sel.copy(topics = if (k in sel.topics) sel.topics - k else sel.topics + k) } }
            }
            PLabel("PERIODE", p.mut)
            Seg40(listOf("dag" to "I dag", "24t" to "24 t", "uke" to "Uke"), sel.period) { sel = sel.copy(period = it) }
            PLabel("LENGDE", p.mut)
            Seg40(listOf("kort" to "Kort", "lang" to "Lang"), sel.length) { sel = sel.copy(length = it) }
            val n = vm.ngItems40(sel).size
            PButton("✦ Lag sammendrag ($n saker)", Modifier.fillMaxWidth(), kind = "lab") {
                vm.setNgSel40(sel); s.ngPick = false; vm.runNewsGlimt40(force = true)
            }
        }
    }
}

/* ======================= Nyheter: sammendrag per kategori ======================= */

@Composable
internal fun CatSummary46(vm: AppViewModel, cat: String, items: List<NewsItem>) {
    val p = PaperPal.current
    val n = vm.p46.news
    LaunchedEffect(cat, items.size) { vm.loadSummary46(cat, items.size) }
    val s = n.summaries[cat]
    val busy = n.summaryBusy == cat && !n.summaries.containsKey(cat)
    if (s == null && !busy) return
    val ctx = LocalContext.current
    Column(Modifier.fillMaxWidth().padding(bottom = 10.dp).clip(RoundedCornerShape(18.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(18.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PLabel("✦ GLIMT · SAMMENDRAG", p.lab, modifier = Modifier.weight(1f))
            s?.updatedAt?.let { u -> runCatching { java.time.OffsetDateTime.parse(u).atZoneSameInstant(java.time.ZoneId.of("Europe/Oslo")).toLocalTime().toString().take(5) }.getOrNull() }
                ?.let { Text("oppdatert kl. $it", color = p.mut, fontSize = 11.5.sp) }
        }
        if (s == null) {
            // Skjelett mens Glimt lager sammendraget (lokal Ollama).
            repeat(3) { i -> Box(Modifier.fillMaxWidth(if (i == 2) .6f else 1f).height(12.dp).clip(RoundedCornerShape(6.dp)).background(p.line)) }
            return@Column
        }
        if (s.points.isNotEmpty()) s.points.take(5).forEach { (t, ref) ->
            val item = ref?.let { r -> items.firstOrNull { it.id == r || it.url == r } }
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable(enabled = item != null || ref?.startsWith("http") == true) {
                if (item != null) vm.openArticle27(item) else ref?.let { openLink(ctx, it) }
            }.padding(vertical = 2.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("•", color = p.lab, fontSize = 15.sp)
                Text(t, color = p.ink, fontSize = 14.5.sp, lineHeight = 20.sp, modifier = Modifier.weight(1f))
            }
        } else s.text?.let { PSerif(it, 17.sp, p.ink, italic = true, weight = FontWeight.Normal, maxLines = 6) }
    }
}

/* ======================= Nyheter: kategorier og «For deg» i Innstillinger ======================= */

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
internal fun NewsCategories46(vm: AppViewModel, p: PaperPal) {
    val n = vm.p46.news
    var word by rememberSaveable { mutableStateOf("") }
    PLabel("Kategorier", p.lab)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("✦ For deg", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
        Text("Saker som passer interessene dine, rangert av Glimt etter hva du leser.", color = p.mut, fontSize = 12.5.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            n.interests.forEach { w ->
                Row(Modifier.height(32.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).padding(start = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(w, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    Box(Modifier.size(26.dp).clip(CircleShape).clickable(onClickLabel = "Fjern $w") { vm.setInterests46(n.interests - w) }, contentAlignment = Alignment.Center) {
                        Text("×", modifier = Modifier.semantics { contentDescription = "Fjern" }, color = p.mut, fontSize = 15.sp)
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().height(42.dp).clip(RoundedCornerShape(12.dp)).border(1.dp, p.line, RoundedCornerShape(12.dp)).padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) {
                if (word.isEmpty()) Text("Legg til interesse (f.eks. Bodø/Glimt)", color = p.mut, fontSize = 13.5.sp)
                BasicTextField(word, { word = it }, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 13.5.sp), cursorBrush = SolidColor(p.lab),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { if (word.isNotBlank()) { vm.setInterests46(n.interests + word); word = "" } }),
                    modifier = Modifier.fillMaxWidth())
            }
            Text("Legg til", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.clickable(role = Role.Button, onClickLabel = "Legg til interessen") { if (word.isNotBlank()) { vm.setInterests46(n.interests + word); word = "" } }.padding(12.dp))
        }
        if (n.custom.isNotEmpty()) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        n.custom.forEach { c ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(c.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    if (c.keywords.isNotEmpty()) Text(c.keywords.joinToString(", "), color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Box(Modifier.size(30.dp).clip(CircleShape).clickable(onClickLabel = "Slett ${c.name}") { vm.deleteNewsCat46(c.id) }, contentAlignment = Alignment.Center) {
                    Text("×", modifier = Modifier.semantics { contentDescription = "Fjern" }, color = p.mut, fontSize = 17.sp)
                }
            }
        }
        if (n.newCatOpen) {
            var name by rememberSaveable { mutableStateOf("") }
            var kw by rememberSaveable { mutableStateOf("") }
            PField("Navn", name, { name = it; n.catErr = null }, placeholder = "F.eks. Elbil")
            PField("Nøkkelord (valgfritt, kommaseparert)", kw, { kw = it }, placeholder = "tesla, lading, elbil")
            n.catErr?.let { Text(it, color = p.lab, fontSize = 12.5.sp) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("Avbryt", Modifier.weight(1f), kind = "line", height = 40.dp) { n.newCatOpen = false; n.catErr = null }
                PButton("Lagre", Modifier.weight(1f), height = 40.dp) { vm.addNewsCat46(name, kw) }
            }
        } else Text("+ Ny kategori", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, modifier = Modifier.clickable(role = Role.Button) { Haptics.select(); n.newCatOpen = true }.padding(vertical = 4.dp))
    }
}

/** Favicon: serverens cachede ikon, ellers domenets logo; feiler alt, bokstavene på farget bakgrunn. 34 dp, hvit, tynn kant, 6 dp marg. */
@Composable
internal fun FeedIcon46(vm: AppViewModel, f: NewsFeed, p: PaperPal) {
    val fav = vm.p46.news.favicons[f.id]
    val dom = feedDomain46(f.url)
    val bmp by produceState<Bitmap?>(null, fav, dom) {
        value = (if (fav != null && fav.startsWith("/")) runCatching { vm.image(fav) }.getOrNull() else null) ?: runCatching { vm.logo(dom) }.getOrNull()
    }
    val b = bmp
    if (b != null) Box(Modifier.size(34.dp).clip(RoundedCornerShape(9.dp)).background(Color.White).border(1.dp, p.line, RoundedCornerShape(9.dp)).padding(6.dp)) {
        Image(b.asImageBitmap(), null, contentScale = ContentScale.Fit, modifier = Modifier.matchParentSize())
    } else Box(Modifier.size(34.dp).clip(RoundedCornerShape(9.dp)).background(p.ink), contentAlignment = Alignment.Center) {
        Text(f.name.take(2).uppercase(), color = p.bg, fontWeight = FontWeight.Bold, fontSize = 10.sp)
    }
}

/** Kategori som ekte nedtrekksmeny forankret i pillen: ✦ Auto + standardkategoriene + egne. Lagres med en gang. */
@Composable
internal fun FeedCatMenu46(vm: AppViewModel, f: NewsFeed, p: PaperPal, cats: List<NewsCategory>) {
    var open by remember { mutableStateOf(false) }
    val ai = vm.news?.aiCategorize == true
    val opts = vm.p46.news.catOptions.ifEmpty {
        listOf(NewsCategory("auto", "Auto")) + cats.filter { it.id != "siste" && it.id != "fordeg" && it.id != "for-deg" } +
            vm.p46.news.custom.filter { c -> cats.none { it.id == c.id } }.map { NewsCategory(it.id, it.name) }
    }
    fun label(id: String) = if (id == "auto") (if (ai) "✦ Auto" else "Auto") else opts.firstOrNull { it.id == id }?.name?.removePrefix("✦ ") ?: id.replaceFirstChar { it.uppercase() }
    Box {
        Box(Modifier.height(30.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(role = Role.DropdownList, onClickLabel = "Velg kategori") { open = true }.padding(horizontal = 10.dp),
            contentAlignment = Alignment.Center) { Text(label(f.category) + " ▾", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1) }
        DropdownMenu(open, { open = false }, containerColor = p.card) {
            opts.forEach { o ->
                DropdownMenuItem({ Text(label(o.id), color = p.ink, fontWeight = if (o.id == f.category) FontWeight.Bold else FontWeight.Normal) },
                    { open = false; if (o.id != f.category) { Haptics.select(); vm.setFeedCategory(f.id, o.id) } },
                    trailingIcon = if (o.id == f.category) ({ Text("✓", color = p.ink) }) else null)
            }
        }
    }
}

package no.kristo.finanshub.ui

import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import android.content.Intent
import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import no.kristo.finanshub.*
import java.time.LocalDate

/* Prompt 46 (ANDROID46), del 2: Nyheter i Innstillinger, Google Photos-bakgrunn og Subscription-loggen. Data: P46b.kt. */

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
    var word by remember { mutableStateOf("") }
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
            Text("Legg til", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.clickable { if (word.isNotBlank()) { vm.setInterests46(n.interests + word); word = "" } }.padding(12.dp))
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
            var name by remember { mutableStateOf("") }
            var kw by remember { mutableStateOf("") }
            PField("Navn", name, { name = it; n.catErr = null }, placeholder = "F.eks. Elbil")
            PField("Nøkkelord (valgfritt, kommaseparert)", kw, { kw = it }, placeholder = "tesla, lading, elbil")
            n.catErr?.let { Text(it, color = p.lab, fontSize = 12.5.sp) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("Avbryt", Modifier.weight(1f), kind = "line", height = 40.dp) { n.newCatOpen = false; n.catErr = null }
                PButton("Lagre", Modifier.weight(1f), height = 40.dp) { vm.addNewsCat46(name, kw) }
            }
        } else Text("+ Ny kategori", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, modifier = Modifier.clickable { Haptics.select(); n.newCatOpen = true }.padding(vertical = 4.dp))
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

/* ======================= Bakgrunn: Google Photos-album ======================= */

/** Raden under «Eget bilde» i bakgrunnsmenyen. */
@Composable
internal fun GphotoRow46(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(Unit) { if (vm.p46.gp == null) vm.loadGphoto46() }
    val g = vm.p46.gp
    val on = vm.photoKind == "gphoto"
    Row(
        Modifier.fillMaxWidth().heightIn(min = 50.dp).clip(RoundedCornerShape(12.dp)).background(if (on) p.popSel else Color.Transparent)
            .clickable { if (on && g?.error != null) vm.retryGphoto46() else { vm.photoMenu = false; vm.p46.gpErr = null; vm.p46.gpSheet = true } }.padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(30.dp).clip(RoundedCornerShape(8.dp)).background(Color.White).border(1.dp, p.line, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
            vm.photoThumbs["gphoto"]?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize().clip(RoundedCornerShape(8.dp))) }
                ?: Text("✿", color = Color(0xFF4F8FD6), fontSize = 15.sp)
        }
        Column(Modifier.weight(1f)) {
            Text("Google Photos-album", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
            Text(when {
                g?.error != null && on -> "Fikk ikke hentet albumet · trykk for å prøve igjen"
                g?.configured == true -> g.rowText ?: "Bytter bilde hver time"
                else -> "Delt album som bakgrunn"
            }, color = if (g?.error != null && on) p.lab else p.mut, fontSize = 11.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (on) Text("✓", color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}

/** Felt for lenken + «Bruk album» / «Fjern». */
@Composable
internal fun GphotoSheet46(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p46
    var url by remember { mutableStateOf(s.gp?.url ?: "") }
    Dialog(onDismissRequest = { s.gpSheet = false }) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(p.bg).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PSerif("Google Photos-album", 22.sp)
            Text("Lim inn lenken til et delt album. Bakgrunnen bytter bilde hver time, likt på alle enhetene dine.", color = p.mut, fontSize = 13.sp)
            PField("Lenke", url, { url = it; s.gpErr = null }, placeholder = "https://photos.app.goo.gl/…", keyboard = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done))
            s.gpErr?.let { Text(it, color = p.lab, fontSize = 12.5.sp) }
            if (s.gpBusy) Text("Henter bilder fra albumet …", color = p.mut, fontSize = 13.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (s.gp?.configured == true) PButton("Fjern", Modifier.weight(1f), kind = "line", height = 44.dp) { vm.removeGphoto46() }
                PButton(if (s.gpBusy) "Henter …" else "Bruk album", Modifier.weight(1f), height = 44.dp) { if (!s.gpBusy) vm.useGphoto46(url) }
            }
        }
    }
}

/* ======================= Subscription OS → Historikk → Logg ======================= */

private val MON46 = listOf("januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember")
private fun kr46(v: Double) = "${n0(v)} kr"

/**
 * «Logg» under «Denne måneden»: N fakturaer · N prøveperioder · X kr betalt siste 12 mnd, filter Alle / Fakturaer / Prøveperioder,
 * gruppert per måned (nyeste først) med månedssum, 3 måneder om gangen og «Eksporter CSV».
 */
@Composable
internal fun SubLog46(vm: AppViewModel, fg: Color, mut: Color, card: Color, pos: Color) {
    val s = vm.p46.subLog
    val ctx = LocalContext.current
    LaunchedEffect(vm.account?.id) { if (s.events == null) vm.loadSubLog46() }
    val all = s.events
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Logg", color = fg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, modifier = Modifier.weight(1f))
            if (!all.isNullOrEmpty()) Text("Eksporter CSV", color = fg, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.clip(CircleShape).clickable {
                val list = filtered46(all, s.filter)
                runCatching { ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/csv").putExtra(Intent.EXTRA_SUBJECT, "Abonnementslogg").putExtra(Intent.EXTRA_TEXT, subLogCsv46(list)), "Eksporter CSV")) }
            }.padding(8.dp, 4.dp))
        }
        if (s.missing) { Text("Loggen finnes ikke på serveren ennå. Oppdater Homelab.", color = mut, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp)); return@Column }
        if (all == null) { Text(if (s.busy) "Henter loggen …" else "Ingen logg ennå.", color = mut, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp)); return@Column }
        val since = LocalDate.now().minusMonths(12)
        val nCh = all.count { it.type == "charge" }
        val nTr = all.count { it.type == "trial_start" }
        val paid = all.filter { (it.type == "charge" || it.type == "trial_converted") && it.date.isAfter(since) }.sumOf { kotlin.math.abs(it.amount ?: 0.0) }
        Text("$nCh fakturaer · $nTr prøveperioder · ${kr46(paid)} betalt siste 12 mnd", color = mut, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp))
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("alle" to "Alle", "fakturaer" to "Fakturaer", "prove" to "Prøveperioder").forEach { (k, n) ->
                Box(Modifier.height(32.dp).clip(CircleShape).background(if (s.filter == k) fg else card).clickable { Haptics.select(); s.filter = k; s.months = 3 }.padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center) { Text(n, color = if (s.filter == k) card else fg, fontWeight = FontWeight.SemiBold, fontSize = 13.sp) }
            }
        }
        val list = filtered46(all, s.filter)
        val groups = list.groupBy { it.date.withDayOfMonth(1) }.toSortedMap(compareByDescending { it })
        groups.entries.take(s.months).forEach { (m, ev) ->
            val sum = ev.filter { it.type == "charge" || it.type == "trial_converted" }.sumOf { kotlin.math.abs(it.amount ?: 0.0) }
            Row(Modifier.padding(start = 4.dp, end = 4.dp, top = 4.dp)) {
                Text(MON46[m.monthValue - 1].replaceFirstChar { it.uppercase() } + " ${m.year}", color = fg, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                if (sum > 0) Text("−" + kr46(sum), color = mut, fontFamily = PaperFonts.mono, fontSize = 13.sp)
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(card)) {
                ev.forEachIndexed { i, e ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(mut.copy(alpha = .2f)))
                    SubLogRow46(vm, e, fg, mut, pos)
                }
            }
        }
        val more = groups.size - s.months
        if (more > 0) Text("Vis eldre ($more ${if (more == 1) "måned" else "måneder"})", color = fg, fontWeight = FontWeight.Bold, fontSize = 13.5.sp,
            modifier = Modifier.clip(CircleShape).clickable { Haptics.select(); s.months += 3 }.padding(8.dp))
        if (list.isEmpty()) Text("Ingen hendelser i loggen.", color = mut, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

private fun filtered46(all: List<SubEvent46>, f: String) = when (f) {
    "fakturaer" -> all.filter { it.type == "charge" || it.type == "price_change" }
    "prove" -> all.filter { it.type.startsWith("trial") }
    else -> all
}

@Composable
private fun SubLogRow46(vm: AppViewModel, e: SubEvent46, fg: Color, mut: Color, pos: Color) {
    val trial = e.type.startsWith("trial")
    val d = "${e.date.dayOfMonth}. ${MON46[e.date.monthValue - 1].take(3)}"
    val (desc, amount, green) = when (e.type) {
        "charge" -> Triple("Faktura · $d" + (e.account?.let { " · $it" } ?: "") + (if (e.oldPrice != null && e.amount != null && e.oldPrice < e.amount) " · gammel pris" else ""), e.amount?.let { "−" + kr46(it) } ?: "", false)
        "trial_start" -> Triple("$d · gratis" + (e.days?.let { " i $it dager" } ?: ""), "0 kr", false)
        "trial_cancelled", "trial_end" -> Triple("$d · sagt opp i tide", (e.saved ?: e.amount)?.let { "Spart " + kr46(it) } ?: "", true)
        "trial_converted" -> Triple("$d · " + (e.amount?.let { kr46(it) + "/mnd" } ?: "gikk over til betalt"), e.amount?.let { "−" + kr46(it) } ?: "", false)
        "price_change" -> Triple("$d · ny pris" + (e.oldPrice?.let { " (før ${kr46(it)})" } ?: ""), e.amount?.let { kr46(it) } ?: "", false)
        "cancelled" -> Triple("$d · sagt opp", "", false)
        else -> Triple(d, e.amount?.let { kr46(it) } ?: "", false)
    }
    Row(Modifier.fillMaxWidth().padding(14.dp, 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        SubLogo(vm, null, e.service, 36)
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(e.service, color = fg, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (trial) Text("PRØVE", color = Color(0xFFFF7A3D), fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 9.5.sp,
                    modifier = Modifier.clip(RoundedCornerShape(5.dp)).border(1.dp, Color(0xFFFF7A3D), RoundedCornerShape(5.dp)).padding(horizontal = 5.dp, vertical = 1.dp))
            }
            Text(desc, color = mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(amount, color = if (green) pos else fg, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp)
    }
}

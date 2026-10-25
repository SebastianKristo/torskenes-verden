package no.kristo.finanshub.ui

import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Nyhetsleser (Nyhetsleser.dc.html, variant mobil): morgenavis med kategorifaner, ✦ AI-sammendrag øverst og
 * én rad per sak. Tannhjulet åpner «Kilder og AI». Papirfargene (lys eller mørk).
 */

/** Feedens kategori som etikett: «auto» blir «Auto» (med ✦ når AI-kategorisering er på). */
private fun catName(id: String, cats: List<NewsCategory>): String =
    if (id == "auto") "Auto" else cats.firstOrNull { it.id == id }?.name ?: id.replaceFirstChar { it.uppercase() }

@Composable
internal fun NewsReader(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val d = vm.news
    val cats = d?.categories ?: NEWS_CATS
    // Prompt 24: alle faneikonene lastes med en gang (ikke først når fanen tegnes på nytt).
    LaunchedEffect(d?.ic, d?.icOn, d?.categories) { vm.b24PreloadNewsIcons() }
    // Prompt 27: saken lukkes når leseren lukkes, så den åpnes på listen neste gang.
    DisposableEffect(Unit) { onDispose { vm.closeArticle27() } }
    BackHandler { if (vm.newsSettings) vm.newsSettings = false else vm.newsOpen = false }
    // Prompt 46: gamle lenker til «Kilder og AI» går til Innstillinger → Nyheter (ingen innstillinger på Nyheter-siden).
    LaunchedEffect(vm.newsSettings) { if (vm.newsSettings) vm.openNewsSettings46() }
    val tabs = vm.newsTabs46(cats)
    Box(Modifier.fillMaxSize().background(p.bg).clickable(remember { MutableInteractionSource() }, null) {}.statusBarsPadding()) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(18.dp, 14.dp, 18.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                    Modifier.height(36.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(onClickLabel = "Tilbake") { vm.newsOpen = false }.padding(start = 10.dp, end = 14.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("‹ Tilbake", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp) }
                Column(Modifier.weight(1f)) {
                    val upd = d?.feeds?.size ?: 0
                    PLabel("Nyhetsleser · $upd kilder", p.lab)
                    PSerif("Siste nytt", 30.sp, p.ink, maxLines = 1)
                }
                // Prompt 46: «…» med «Nyhetsinnstillinger» (dyp lenke til Innstillinger → Nyheter) i stedet for ⚙.
                var menu by remember { mutableStateOf(false) }
                Box {
                    Box(
                        Modifier.size(40.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).clickable(onClickLabel = "Mer") { menu = true },
                        contentAlignment = Alignment.Center,
                    ) { Text("⋯", modifier = Modifier.semantics { contentDescription = "Mer" }, color = p.ink, fontSize = 18.sp, fontWeight = FontWeight.Bold) }
                    androidx.compose.material3.DropdownMenu(menu, { menu = false }, containerColor = p.card) {
                        androidx.compose.material3.DropdownMenuItem({ Text("Nyhetsinnstillinger", color = p.ink) }, { menu = false; vm.openNewsSettings46() })
                        androidx.compose.material3.DropdownMenuItem({ Text("Hent nye saker nå", color = p.ink) }, { menu = false; vm.refreshNews() })
                    }
                }
            }
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 18.dp), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                // Prompt 23: ikon ved hver fane (følger tekstfargen).
                tabs.forEach { c -> NewsTab23(vm, c, vm.newsCat == c.id, p) { vm.loadNews(c.id) } }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(18.dp, 16.dp, 18.dp, 40.dp)) {
                vm.newsError?.let { e -> item { Text(e, color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(bottom = 10.dp)) } }
                if (d == null && vm.newsError == null) item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
                if (d != null) {
                    val lead = if (d.aiSummary) d.digest else d.items.firstOrNull()?.title
                    // Prompt 40 (claude-code-nyheter-glimt-side.md): kortet åpner Glimt-siden med langt sammendrag, kilder og bilder.
                    // Prompt 46 (claude-code-nyheter-sammendrag-per-kategori.md): «Siste» beholder det felles sammendraget; hver kategori
                    // har sitt eget øverst (skjelett mens det lages, skjult ved feil eller færre enn 3 saker).
                    if (vm.newsCat == "siste" || !vm.p46.news.catSummary) { if (d.items.isNotEmpty() || !lead.isNullOrBlank()) item { NewsGlimtEntry40(vm, lead) } }
                    else item(key = "catsum-" + vm.newsCat) { CatSummary46(vm, vm.newsCat, d.items) }
                    if (d.items.isEmpty()) item { Text("Ingen saker i denne kategorien.", color = p.mut, fontSize = 14.sp, modifier = Modifier.padding(vertical = 12.dp)) }
                    items(d.items.size) { i ->
                        val x = d.items[i]
                        Column {
                            // Prompt 27: trykk åpner saken i appen (NewsArticle27), bilde 76 × 76 til høyre.
                            Row(
                                Modifier.fillMaxWidth().clickable { vm.openArticle27(x) }.padding(vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
                            ) {
                                if (vm.newsCat == "siste") PLabel(catName(x.category ?: "norge", cats), p.lab, modifier = Modifier.width(74.dp).padding(top = 3.dp))
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(x.title, color = p.ink, fontSize = 15.sp, lineHeight = 20.sp)
                                    Text(listOf(x.feed, newsTime(x.published)).filter(String::isNotBlank).joinToString(" · ") + if (x.ai && d.aiCategorize) " · ✦ AI" else "",
                                        color = p.mut, fontSize = 12.sp)
                                }
                                NewsImage27(vm, x.image, x.feed, Modifier.size(76.dp), 12.dp)
                            }
                            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                        }
                    }
                }
            }
        }
        if (vm.b27.articleFor != null) NewsArticle27(vm, p, cats)
        if (vm.m23.icPickFor != null) IconPicker23(vm, p, cats)
    }
}

/**
 * Prompt 46 (claude-code-nyheter-innstillinger-flytt.md): «Kilder og AI» som innhold i Innstillinger → Nyheter (samme lagring som før).
 * Adressene har favicon (serverens cachede ikon / domenets logo, ellers bokstavene) og kategorien som ekte nedtrekksmeny.
 */
@Composable
internal fun NewsSettingsContent46(vm: AppViewModel, p: PaperPal) {
    val d = vm.news
    val cats = d?.categories ?: NEWS_CATS
    var nf by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { if (vm.news == null) vm.loadNews() }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card)) {
                NewsToggle("✦ AI-sammendrag", "Lager en kort ingress over de viktigste sakene øverst.", d?.aiSummary ?: true, p, false) { vm.setNewsSetting("aiSummary", it) }
                NewsToggle("✦ Sammendrag per kategori", "Eget Glimt-sammendrag øverst i hver kategori.", vm.p46.news.catSummary, p, true) { vm.setCatSummary46(it) }
                NewsToggle("✦ AI-kategorisering", "Setter kategori per sak når kilden står på Auto.", d?.aiCategorize ?: true, p, true) { vm.setNewsSetting("aiCategorize", it) }
            }
            NewsCategories46(vm, p)
            NewsIconsSection23(vm, p, vm.newsTabs46(cats))
            Row(verticalAlignment = Alignment.Bottom) {
                PLabel("Adresser · ${d?.feeds?.size ?: 0}", p.lab, modifier = Modifier.weight(1f))
                Text("Velg kategori per kilde", color = p.mut, fontSize = 12.sp)
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card)) {
                val feeds = d?.feeds ?: emptyList()
                if (feeds.isEmpty()) Text("Ingen kilder ennå.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
                feeds.forEachIndexed { i, f ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Row(Modifier.fillMaxWidth().padding(12.dp, 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        FeedIcon46(vm, f, p)
                        Column(Modifier.weight(1f)) {
                            Text(f.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(f.lastError ?: f.url, color = if (f.lastError != null) p.lab else p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        FeedCatMenu46(vm, f, p, cats)
                        Box(Modifier.size(28.dp).clip(RoundedCornerShape(8.dp)).clickable(onClickLabel = "Fjern ${f.name}") { vm.removeFeed(f.id) }, contentAlignment = Alignment.Center) {
                            Text("×", modifier = Modifier.semantics { contentDescription = "Fjern" }, color = p.mut, fontSize = 16.sp)
                        }
                    }
                }
            }
            BasicTextField(
                nf, { nf = it }, singleLine = true,
                textStyle = TextStyle(color = p.ink, fontSize = 14.sp, fontFamily = PaperFonts.sans),
                cursorBrush = SolidColor(p.lab),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { if (nf.isNotBlank()) { vm.addFeed(nf); nf = "" } }),
                modifier = Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(14.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp),
                decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (nf.isEmpty()) Text("https://www.nrk.no/toppsaker.rss", color = p.mut, fontSize = 14.sp); inner() } },
            )
            Box(
                Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(14.dp)).background(p.lab).clickable { if (nf.isNotBlank()) { vm.addFeed(nf); nf = "" } },
                contentAlignment = Alignment.Center,
            ) { if (vm.newsBusy) CircularProgressIndicator(color = p.onLab, modifier = Modifier.size(20.dp), strokeWidth = 2.dp) else Text("+ Legg til adresse", color = p.onLab, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
            Text(if (d?.aiCategorize != false) "✦ AI finner navnet på kilden og foreslår kategori. Ikonet hentes fra nettstedet." else "Kategorien settes til Auto.", color = p.mut, fontSize = 12.sp)
            Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(14.dp)).border(1.dp, p.line, RoundedCornerShape(14.dp)).clickable { vm.refreshNews() }, contentAlignment = Alignment.Center) {
                Text("Hent nye saker nå", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            }
    }
    // Ikonvelgeren i et eget vindu (Innstillinger er en LazyColumn – et rutenett inni den ville fått uendelig høyde).
    if (vm.m23.icPickFor != null) androidx.compose.ui.window.Dialog({ vm.m23.icPickFor = null }, androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        IconPicker23(vm, p, vm.newsTabs46(cats))
    }
}

@Composable
internal fun NewsToggle(title: String, sub: String, on: Boolean, p: PaperPal, top: Boolean, onChange: (Boolean) -> Unit) {
    if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
    Row(Modifier.fillMaxWidth().clickable { onChange(!on) }.padding(14.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f)) {
            Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
            Text(sub, color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
        }
        Box(Modifier.size(46.dp, 28.dp).clip(CircleShape).background(if (on) Color(0xFF2F7A4F) else Color(0xFF9A958A)).padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
            Box(Modifier.size(22.dp).clip(CircleShape).background(Color.White))
        }
    }
}

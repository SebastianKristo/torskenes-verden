package no.kristo.finanshub.ui

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
 * én rad per sak. Tannhjulet åpner «Kilder og AI». Brukes både i Papir og i Klassisk (der med papirfargene).
 */

/** Feedens kategori som etikett: «auto» blir «Auto» (med ✦ når AI-kategorisering er på). */
private fun catName(id: String, cats: List<NewsCategory>): String =
    if (id == "auto") "Auto" else cats.firstOrNull { it.id == id }?.name ?: id.replaceFirstChar { it.uppercase() }

@Composable
internal fun NewsReader(vm: AppViewModel) {
    // Papirfargene også i Klassisk, slik designet er tegnet (lys eller mørk etter appens modus).
    val p = if (Tone.paper) PaperPal.current else if (Tone.light) PaperPal.LIGHT else PaperPal.DARK
    val ctx = LocalContext.current
    val d = vm.news
    val cats = d?.categories ?: NEWS_CATS
    BackHandler { if (vm.newsSettings) vm.newsSettings = false else vm.newsOpen = false }
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
                Box(
                    Modifier.size(40.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).clickable(onClickLabel = "Kilder og AI") { vm.newsSettings = true },
                    contentAlignment = Alignment.Center,
                ) { Text("⚙", color = p.ink, fontSize = 18.sp) }
            }
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 18.dp), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                cats.forEach { c ->
                    val on = vm.newsCat == c.id
                    Column(Modifier.width(IntrinsicSize.Max).clickable(role = Role.Tab) { vm.loadNews(c.id) }.padding(top = 6.dp)) {
                        Text(c.name, color = if (on) p.ink else p.mut, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.padding(bottom = 8.dp))
                        Box(Modifier.fillMaxWidth().height(2.dp).background(if (on) p.ink else Color.Transparent))
                    }
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(18.dp, 16.dp, 18.dp, 40.dp)) {
                vm.newsError?.let { e -> item { Text(e, color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(bottom = 10.dp)) } }
                if (d == null && vm.newsError == null) item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
                if (d != null) {
                    val lead = if (d.aiSummary) d.digest else d.items.firstOrNull()?.title
                    if (!lead.isNullOrBlank()) item {
                        Column(Modifier.padding(bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (d.aiSummary && !d.digest.isNullOrBlank()) PLabel("✦ AI-sammendrag", p.lab)
                            PSerif(lead, 19.sp, p.ink, italic = true, weight = FontWeight.Normal)
                        }
                    }
                    if (d.items.isEmpty()) item { Text("Ingen saker i denne kategorien.", color = p.mut, fontSize = 14.sp, modifier = Modifier.padding(vertical = 12.dp)) }
                    items(d.items.size) { i ->
                        val x = d.items[i]
                        Column {
                            Row(
                                Modifier.fillMaxWidth().clickable { openLink(ctx, x.url) }.padding(vertical = 11.dp),
                                verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(14.dp),
                            ) {
                                if (vm.newsCat == "siste") PLabel(catName(x.category ?: "norge", cats), p.lab, modifier = Modifier.width(74.dp).padding(top = 3.dp))
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(x.title, color = p.ink, fontSize = 15.sp, lineHeight = 20.sp)
                                    Text(listOf(x.feed, newsTime(x.published)).filter(String::isNotBlank).joinToString(" · ") + if (x.ai && d.aiCategorize) " · ✦ AI" else "",
                                        color = p.mut, fontSize = 12.sp)
                                }
                                Text("›", color = p.mut)
                            }
                            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                        }
                    }
                }
            }
        }
        if (vm.newsSettings) NewsSettings(vm, p, cats)
    }
}

/** «Kilder og AI»: to brytere, adresselisten (trykk på kategorien for å endre) og «+ Legg til adresse». */
@Composable
private fun NewsSettings(vm: AppViewModel, p: PaperPal, cats: List<NewsCategory>) {
    val d = vm.news
    var nf by remember { mutableStateOf("") }
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .35f)).clickable { vm.newsSettings = false }, contentAlignment = Alignment.BottomCenter) {
        Column(
            Modifier.fillMaxWidth().fillMaxHeight(.86f).clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)).background(p.bg)
                .clickable(remember { MutableInteractionSource() }, null) {}.verticalScroll(rememberScrollState()).navigationBarsPadding().imePadding()
                .padding(18.dp, 16.dp, 18.dp, 30.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { PLabel("Nyhetsleser", p.lab); PSerif("Kilder og AI", 26.sp, p.ink) }
                Box(Modifier.height(36.dp).clip(CircleShape).background(p.ink).clickable { vm.newsSettings = false }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                    Text("Ferdig", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card)) {
                NewsToggle("✦ AI-sammendrag", "Lager en kort ingress over de viktigste sakene øverst.", d?.aiSummary ?: true, p, false) { vm.setNewsSetting("aiSummary", it) }
                NewsToggle("✦ AI-kategorisering", "Setter kategori per sak når kilden står på Auto.", d?.aiCategorize ?: true, p, true) { vm.setNewsSetting("aiCategorize", it) }
            }
            Row(verticalAlignment = Alignment.Bottom) {
                PLabel("Adresser · ${d?.feeds?.size ?: 0}", p.lab, modifier = Modifier.weight(1f))
                Text("Trykk på kategorien for å endre", color = p.mut, fontSize = 12.sp)
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card)) {
                val feeds = d?.feeds ?: emptyList()
                if (feeds.isEmpty()) Text("Ingen kilder ennå.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
                feeds.forEachIndexed { i, f ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Row(Modifier.fillMaxWidth().padding(12.dp, 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.size(34.dp).clip(RoundedCornerShape(9.dp)).background(p.ink), contentAlignment = Alignment.Center) {
                            Text(f.name.take(2).uppercase(), color = p.bg, fontWeight = FontWeight.Bold, fontSize = 10.sp)
                        }
                        Column(Modifier.weight(1f)) {
                            Text(f.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(f.lastError ?: f.url, color = if (f.lastError != null) p.lab else p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        val order = listOf("auto") + cats.map { it.id }.filter { it != "siste" }
                        Box(
                            Modifier.height(30.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable {
                                val next = order[(order.indexOf(f.category).coerceAtLeast(0) + 1) % order.size]
                                vm.setFeedCategory(f.id, next)
                            }.padding(horizontal = 10.dp),
                            contentAlignment = Alignment.Center,
                        ) { Text((if (f.category == "auto" && d?.aiCategorize == true) "✦ " else "") + catName(f.category, cats) + " ▾", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1) }
                        Box(Modifier.size(28.dp).clip(RoundedCornerShape(8.dp)).clickable(onClickLabel = "Fjern ${f.name}") { vm.removeFeed(f.id) }, contentAlignment = Alignment.Center) {
                            Text("×", color = p.mut, fontSize = 16.sp)
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
            Text(if (d?.aiCategorize != false) "✦ AI finner navnet på kilden og foreslår kategori." else "Kategorien settes til Auto.", color = p.mut, fontSize = 12.sp)
            Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(14.dp)).border(1.dp, p.line, RoundedCornerShape(14.dp)).clickable { vm.refreshNews() }, contentAlignment = Alignment.Center) {
                Text("Hent nye saker nå", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun NewsToggle(title: String, sub: String, on: Boolean, p: PaperPal, top: Boolean, onChange: (Boolean) -> Unit) {
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

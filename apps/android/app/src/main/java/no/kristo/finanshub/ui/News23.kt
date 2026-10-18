package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 23: ikoner på fanene i Nyhetsleser (Nyhetsleser.dc.html). SVG hentes via /api/icons/:prefix/:name.svg,
 * tolkes til en vektor og tegnes i tekstfargen (fargesett som emoji beholder egne farger). Ikonvelger med søk i Iconify.
 */

/** Ett Iconify-ikon («prefix:name») i gitt farge. Tomt mens det lastes. */
@Composable
internal fun IconifyIcon(vm: AppViewModel, id: String?, tint: Color, size: Dp, modifier: Modifier = Modifier) {
    if (id.isNullOrBlank()) return
    LaunchedEffect(id) { vm.loadIcon23(id) }
    val v = vm.m23.icons[id]
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        if (v != null) Icon(v, null, tint = if (iconIsColor(id)) Color.Unspecified else tint, modifier = Modifier.size(size))
    }
}

/** Fane i leseren: ikon (16 dp, følger tekstfargen) og navn. */
@Composable
internal fun NewsTab23(vm: AppViewModel, c: NewsCategory, on: Boolean, p: PaperPal, onClick: () -> Unit) {
    val d = vm.news
    val id = d?.takeIf { it.icOn }?.iconFor(c.id) ?: if (d == null) NEWS_ICON_DEFAULTS[c.id] else null
    val fg = if (on) p.ink else p.mut
    Column(Modifier.width(IntrinsicSize.Max).clickable(role = androidx.compose.ui.semantics.Role.Tab, onClick = onClick).padding(top = 6.dp)) {
        Row(Modifier.padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (id != null) IconifyIcon(vm, id, fg, 16.dp)
            Text(c.name, color = fg, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
        }
        Box(Modifier.fillMaxWidth().height(2.dp).background(if (on) p.ink else Color.Transparent))
    }
}

/** «IKONER PÅ FANENE» i Kilder og AI: «Vis ikoner», én rad per fane med ikon og kilde, og «✦ La AI velge alle». */
@Composable
internal fun NewsIconsSection23(vm: AppViewModel, p: PaperPal, cats: List<NewsCategory>) {
    val d = vm.news
    val s = vm.m23
    val on = d?.icOn ?: true
    Row(verticalAlignment = Alignment.Bottom) {
        PLabel("Ikoner på fanene", p.lab, modifier = Modifier.weight(1f))
        Text(if (s.icAiAllBusy) "✦ Velger …" else "✦ La AI velge alle", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 12.5.sp,
            modifier = Modifier.clickable(enabled = !s.icAiAllBusy && d != null) { vm.aiPickAllIcons23(cats) })
    }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card)) {
        Row(Modifier.fillMaxWidth().clickable(enabled = d != null) { vm.saveNewsIcons23(d!!.ic, d.icSrc, !on) }.padding(14.dp, 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f)) {
                Text("Vis ikoner", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
                Text("Ved siden av navnet på hver fane", color = p.mut, fontSize = 12.5.sp)
            }
            Box(Modifier.size(46.dp, 28.dp).clip(CircleShape).background(if (on) p.ink else p.line).padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
                Box(Modifier.size(22.dp).clip(CircleShape).background(Color.White))
            }
        }
        cats.forEach { c ->
            val id = d?.iconFor(c.id)
            val src = when {
                d == null || !d.ic.containsKey(c.id) -> "Standard"
                d.icSrc[c.id] == "ai" -> "✦ AI"
                d.ic[c.id].isNullOrBlank() -> "Ingen"
                else -> "Valgt"
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable { openIconPicker23(vm, c) }.padding(14.dp, 8.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(p.bg), contentAlignment = Alignment.Center) { IconifyIcon(vm, id, p.ink, 20.dp) }
                Column(Modifier.weight(1f)) {
                    Text(c.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1)
                    Text(id ?: "ingen ikon", color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Medium, fontSize = 11.5.sp, maxLines = 1)
                }
                Text(src, color = if (src == "✦ AI") p.lab else p.mut, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                Text("›", color = p.mut)
            }
        }
    }
}

private fun openIconPicker23(vm: AppViewModel, c: NewsCategory) {
    val kw = iconKeyword(c.id)
    vm.m23.icPickFor = c.id
    vm.m23.icQuery = kw
    vm.m23.icResults = null
    vm.searchIcons23(kw)
}

/** Ikonvelgeren: søk (engelske ord), bibliotek, ✦ La AI velge, Ingen ikon og opptil 96 treff i et rutenett. */
@Composable
internal fun IconPicker23(vm: AppViewModel, p: PaperPal, cats: List<NewsCategory>) {
    val s = vm.m23
    val catId = s.icPickFor ?: return
    val cat = cats.firstOrNull { it.id == catId } ?: NewsCategory(catId, catId)
    val cur = vm.news?.iconFor(catId)
    val close = { s.icPickFor = null; s.icResults = null }
    BackHandler { close() }
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .35f)).clickable { close() }, contentAlignment = Alignment.BottomCenter) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(.86f).clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)).background(p.bg)
            .clickable(remember { MutableInteractionSource() }, null) {}.navigationBarsPadding().imePadding()) {
            Column(Modifier.padding(16.dp, 16.dp, 16.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.fillMaxWidth()) {
                    Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                        PLabel("Ikon for", p.lab)
                        PSerif(cat.name, 22.sp, p.ink, maxLines = 1)
                    }
                    Box(Modifier.align(Alignment.CenterEnd).size(38.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).clickable { close() },
                        contentAlignment = Alignment.Center) { Text("×", color = p.ink, fontSize = 17.sp) }
                }
                Row(Modifier.fillMaxWidth().height(46.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).padding(start = 14.dp, end = 6.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("⌕", color = p.mut, fontSize = 18.sp)
                    BasicTextField(
                        s.icQuery, { s.icQuery = it }, singleLine = true,
                        textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Medium),
                        cursorBrush = SolidColor(p.lab),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { vm.searchIcons23() }),
                        modifier = Modifier.weight(1f),
                        decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (s.icQuery.isEmpty()) Text("Søk etter ikon (engelsk), f.eks. football", color = p.mut, fontSize = 15.sp, maxLines = 1); inner() } },
                    )
                    Box(Modifier.height(36.dp).clip(CircleShape).background(p.ink).clickable { vm.searchIcons23() }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                        Text("Søk", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                }
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    ICON_LIBS.forEach { (k, n) ->
                        val sel = s.icLib == k
                        Box(Modifier.height(32.dp).clip(CircleShape).background(if (sel) p.ink else p.card).border(1.dp, if (sel) p.ink else p.line, CircleShape)
                            .clickable { s.icLib = k; vm.searchIcons23(lib = k) }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                            Text(n, color = if (sel) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1)
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.weight(1f).height(40.dp).clip(CircleShape).background(p.lab).clickable(enabled = !s.icAiBusy) { vm.aiPickIcon23(catId, cat.name) }, contentAlignment = Alignment.Center) {
                        Text(if (s.icAiBusy) "✦ Velger …" else "✦ La AI velge", color = p.onLab, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
                    }
                    Box(Modifier.height(40.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).clickable { vm.pickNewsIcon23(catId, "", "pick") }.padding(horizontal = 16.dp),
                        contentAlignment = Alignment.Center) { Text("Ingen ikon", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp) }
                }
                val res = s.icResults
                val st = when {
                    s.icBusy -> "Søker i over 200 ikonbibliotek …"
                    s.icError != null -> s.icError!!
                    res == null -> ""
                    res.isEmpty() -> "Ingen treff. Prøv et annet engelsk ord."
                    else -> "${res.size} av ${maxOf(s.icTotal, res.size)} treff · Iconify (Lucide, Material, Phosphor, Tabler, Font Awesome …)"
                }
                if (st.isNotEmpty()) Text(st, color = p.mut, fontSize = 12.sp)
            }
            LazyVerticalGrid(GridCells.Adaptive(56.dp), Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, 24.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val res = s.icResults ?: emptyList()
                items(res.size) { i ->
                    val id = res[i]
                    Box(Modifier.aspectRatio(1f).clip(RoundedCornerShape(14.dp)).background(p.card).border(2.dp, if (id == cur) p.lab else Color.Transparent, RoundedCornerShape(14.dp))
                        .clickable { vm.pickNewsIcon23(catId, id, "pick") }, contentAlignment = Alignment.Center) { IconifyIcon(vm, id, p.ink, 26.dp) }
                }
            }
        }
    }
}

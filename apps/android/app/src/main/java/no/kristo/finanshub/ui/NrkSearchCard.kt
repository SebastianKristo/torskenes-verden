package no.kristo.finanshub.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 88 (AND88): kortet «NRK» øverst i NRK-fanen (fasit public/js/media-nrk.js og «Media NRK.dc.html», mobil = én kolonne).
 *  - Søkefelt, Kvalitet og Komprimer (KvalKomp87) og VPN-merke. Treff med 16:9-bilde og merke Serie/Film/Radio/Episode.
 *    Film/episode/radio har «Last ned» (trykk = køen). Serie åpner seriesiden.
 *  - Seriesiden: bilde, tittel, beskrivelse, sesongvelger (tomme sesonger dempet), episoder med avkrysning og dato · varighet.
 *    Episoder som ikke kan lastes ned, er lastet ned eller ligger i køen, kan ikke velges og får merke. Bunnlinja (SerieBunn88)
 *    ligger fast nederst: «Velg alle tilgjengelige (N)», «Følg serien», «Last ned N episoder» og hjelpeteksten.
 * Kortet legges ut som biter i den samme lazy-lista som resten av fanen (kort87 med topp/bunn), med nøkler på alle rader.
 */

/** Bilde fra vår egen bildeproxy (samme innlogging som andre Media-bilder, Img50). Tegner ingenting før bildet er hentet. */
@Composable
internal fun NettBilde88(vm: AppViewModel, url: String?, modifier: Modifier, px: Int = 640) {
    val ctx = LocalContext.current.applicationContext
    var bmp by remember(url) { mutableStateOf<Bitmap?>(Img50.cached(vm.base, url)) }
    LaunchedEffect(url) { if (url != null && bmp == null) Img50.load(ctx, vm.base, vm.account?.token, url, px)?.let { bmp = it } }
    val b = bmp
    if (b != null) Image(b.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = modifier)
}

/** Fargeflate med tittelen (serif) nederst, og bildet over når det finnes. */
@Composable
private fun Flate88(vm: AppViewModel, url: String?, tittel: String, modifier: Modifier, tekst: Float = 14f, px: Int = 640) {
    Box(modifier.background(flate87(tittel))) {
        Text(tittel, color = Color(0xFFF3EFE6), fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = tekst.sp, lineHeight = (tekst * 1.15f).sp, maxLines = 3,
            overflow = TextOverflow.Ellipsis, modifier = Modifier.align(Alignment.BottomStart).padding(8.dp))
        NettBilde88(vm, url, Modifier.matchParentSize(), px)
    }
}

@Composable
private fun Merke88(text: String, modifier: Modifier, tone: Color? = null) {
    Text(text, color = Color(0xFFF3EFE6), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, maxLines = 1,
        modifier = modifier.padding(6.dp).clip(CircleShape).background(tone ?: Color(0x8C0E0D0B)).padding(horizontal = 8.dp, vertical = 3.dp))
}

/** Plakat på «Serier du følger»: 48×72 (radio/podkast 72×72), 8 dp runding, reserveflate med tittelen. */
@Composable
internal fun FolgPlakat88(vm: AppViewModel, f: NrkFolg87) {
    Flate88(vm, f.bilde, f.tittel, Modifier.size(if (f.radio) 72.dp else 48.dp, 72.dp).clip(RoundedCornerShape(8.dp)), tekst = 12f, px = 240)
}

/* ======================= Kortet i lista ======================= */

internal fun LazyListScope.nrkKort88(vm: AppViewModel, cols: Int) {
    val n = vm.nrk87
    val s = n.sok
    item("nrk-topp") { Topp88(vm) }
    val sid = s.ser
    if (sid != null) { serie88(vm, sid); return }
    val treff = s.treff.orEmpty()
    item("nrk-sum") {
        val p = PaperPal.current
        Column(Modifier.fillMaxWidth().kort87(p.card, p.line, topp = false, bunn = false).padding(20.dp, 4.dp, 20.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(nrkSokSum88(n.sokMulig88(), s.sokLaster, s.sokQ, treff.size), color = p.mut, fontFamily = PaperFonts.mono, fontSize = 12.sp)
            s.sokErr?.let { Text(it, color = p.lab, fontSize = 14.sp) }
            if (s.sokQ.isNotEmpty() && !s.sokLaster && s.sokErr == null && treff.isEmpty() && n.sokMulig88()) Mut87("Ingen treff på «${s.sokQ}».", 15f)
        }
    }
    val rader = treff.chunked(cols)
    items(rader.size, key = { "nrk-tr-" + rader[it].first().url }) { i ->
        val p = PaperPal.current
        Row(Modifier.fillMaxWidth().kort87(p.card, p.line, topp = false, bunn = false).padding(20.dp, 0.dp, 20.dp, 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            for (t in rader[i]) key(t.url) { Treff88(vm, t, Modifier.weight(1f)) }
            repeat(cols - rader[i].size) { Spacer(Modifier.weight(1f)) }
        }
    }
    item("nrk-bunn") { val p = PaperPal.current; Box(Modifier.fillMaxWidth().height(14.dp).kort87(p.card, p.line, topp = false)) }
}

@Composable
private fun Topp88(vm: AppViewModel) {
    val p = PaperPal.current
    val n = vm.nrk87
    val s = n.sok
    val mulig = n.sokMulig88()
    Column(Modifier.fillMaxWidth().kort87(p.card, p.line, bunn = false).padding(20.dp, 20.dp, 20.dp, 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif("NRK", 30.sp, modifier = Modifier.weight(1f))
            n.status?.let { Vpn87(it) }
        }
        // Søkefeltet. Uten katalog i nrk-dl er det dempet, og lenkefeltet under står åpent.
        Row(Modifier.fillMaxWidth().heightIn(min = 50.dp).clip(RoundedCornerShape(14.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(14.dp))
            .alpha(if (mulig) 1f else .5f).padding(start = 14.dp, end = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val ink = p.mut
            Box(Modifier.size(18.dp).drawBehind {
                val w = 2.dp.toPx()
                drawCircle(ink, radius = size.width * .32f, center = Offset(size.width * .45f, size.height * .45f), style = Stroke(w))
                drawLine(ink, Offset(size.width * .7f, size.height * .7f), Offset(size.width * .95f, size.height * .95f), w, cap = StrokeCap.Round)
            })
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (s.q.isEmpty()) Text("Søk i NRK TV og NRK Radio", color = p.mut, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                BasicTextField(s.q, { s.q = it.take(100); if (s.ser != null) s.ser = null }, enabled = mulig, singleLine = true,
                    textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.lab),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { s.ser = null; vm.nrkSok88() }), modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Søk i NRK" })
            }
            if (s.q.isNotEmpty()) Box(Modifier.size(48.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Tøm søk") { vm.nrkTomSok88() }
                .semantics { contentDescription = "Tøm søk" }, contentAlignment = Alignment.Center) {
                Text("×", color = p.mut, fontSize = 22.sp)
            }
        }
        KvalKomp87(vm)
    }
}

/** Ett søketreff: 16:9-bilde med merke, tittel og beskrivelse. Serie → seriesiden; ellers «Last ned» (krever trykk). */
@Composable
private fun Treff88(vm: AppViewModel, t: NrkTreff88, modifier: Modifier) {
    val p = PaperPal.current
    val n = vm.nrk87
    val sid = if (t.art == "serie") nrkSerieId88(t.url) else null
    val iKo = sid == null && n.aktiv88(t.url)
    Column(modifier.then(if (sid != null) Modifier.clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button, onClickLabel = "Åpne serien ${t.tittel}") { vm.apneSerie88(sid, t.tittel) } else Modifier)
        .alpha(if (t.tilgjengelig) 1f else .55f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(12.dp))) {
            Flate88(vm, t.bilde, t.tittel, Modifier.matchParentSize())
            Merke88(nrkArtMerke88(t.art), Modifier.align(Alignment.TopStart))
            if (iKo) Merke88("I KØ", Modifier.align(Alignment.TopEnd), tone88("ok"))
            else if (!t.tilgjengelig) Merke88("IKKE TILGJENGELIG", Modifier.align(Alignment.TopEnd))
        }
        Text(t.tittel, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, lineHeight = 18.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        t.beskrivelse?.let { Text(it, color = p.mut, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        if (sid == null) Knapp87(if (iKo) "I køen" else "Last ned", fylt = !iKo, enabled = t.tilgjengelig && !iKo && !n.sok.lbusy) { vm.nrkTreffLastNed88(t) }
    }
}

/* ======================= Seriesiden ======================= */

private fun LazyListScope.serie88(vm: AppViewModel, sid: String) {
    val n = vm.nrk87
    val s = n.sok
    val last = s.serData[sid]
    val x = last?.data
    val navn = x?.let { nrkSesong88(it.sesonger.map { z -> z.navn to z.tilgjengelig }, s.si[sid]) }
    val eps = navn?.let { s.sesData["$sid/$it"] }
    item("ser-topp") {
        val p = PaperPal.current
        Column(Modifier.fillMaxWidth().kort87(p.card, p.line, topp = false, bunn = false).padding(20.dp, 4.dp, 20.dp, 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            val tittel = x?.tittel ?: s.serTittel.ifBlank { sid }
            Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(14.dp))) {
                Box(Modifier.matchParentSize().background(flate87(tittel)))
                NettBilde88(vm, x?.bilde, Modifier.matchParentSize(), 1080)
                Box(Modifier.matchParentSize().background(Brush.verticalGradient(0f to Color.Transparent, .45f to Color.Transparent, 1f to Color(0xD90E0D0B))))
                Box(Modifier.align(Alignment.TopStart).padding(6.dp).heightIn(min = 48.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Tilbake til søket") { s.ser = null; s.serr = null }
                    .padding(4.dp), contentAlignment = Alignment.Center) {
                    Text("‹ Søk", color = Color(0xFFF3EFE6), fontWeight = FontWeight.Bold, fontSize = 13.sp,
                        modifier = Modifier.clip(CircleShape).background(Color(0x8C0E0D0B)).padding(horizontal = 12.dp, vertical = 7.dp))
                }
                Column(Modifier.align(Alignment.BottomStart).padding(14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    val kat = x?.let { nrkKat88(it.kategori, it.sesonger.count { z -> z.tilgjengelig }) }.orEmpty()
                    if (kat.isNotEmpty()) Text(kat, color = Color(0xFFF3EFE6).copy(alpha = .85f), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, maxLines = 1)
                    Text(tittel, color = Color(0xFFF3EFE6), fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 26.sp, lineHeight = 29.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                }
            }
            when {
                x == null && last?.feil != null -> {
                    Text(last.feil, color = p.lab, fontSize = 14.sp)
                    Knapp87("Prøv igjen") { vm.loadSerie88(sid) }
                }
                x == null -> Mut87("Henter serien fra NRK …", 15f)
                else -> {
                    x.beskrivelse?.let { Text(it, color = p.ink, fontSize = 15.sp, lineHeight = 22.sp) }
                    if (x.sesonger.isNotEmpty()) Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        for (z in x.sesonger) key(z.navn) { Pille88(nrkSesNavn88(z.navn, z.tittel), z.navn == navn, z.tilgjengelig) { vm.velgSesong88(z.navn) } }
                    }
                    when {
                        navn == null -> Mut87("Ingen episoder tilgjengelig hos NRK akkurat nå.", 15f)
                        eps == null -> Mut87("Henter episodene …", 15f)
                        eps.feil != null -> Text(eps.feil, color = p.lab, fontSize = 14.sp)
                        eps.data.isNullOrEmpty() -> Mut87("Ingen episoder i denne sesongen.", 15f)
                    }
                }
            }
        }
    }
    val liste = eps?.data.orEmpty()
    items(liste.size, key = { "ser-ep-$sid-$navn-" + liste[it].id }) { i ->
        val p = PaperPal.current
        Box(Modifier.fillMaxWidth().kort87(p.card, p.line, topp = false, bunn = false).padding(horizontal = 20.dp)) { Ep88(vm, liste[i], x?.tittel ?: sid) }
    }
    item("ser-bunn") { val p = PaperPal.current; Box(Modifier.fillMaxWidth().height(18.dp).kort87(p.card, p.line, topp = false)) }
}

/** Pille (valg, sesongfane): 48 dp trykkflate, «valgt» for skjermleser. Dempet og uten trykk når [enabled] er false (tomme sesonger). */
@Composable
internal fun Pille88(text: String, on: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.heightIn(min = 48.dp).alpha(if (enabled) 1f else .4f).selectable(selected = on, enabled = enabled, role = Role.Tab) { Haptics.select(); onClick() }, contentAlignment = Alignment.Center) {
        Text(text, color = if (on) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1,
            modifier = Modifier.clip(CircleShape).background(if (on) p.ink else p.card).border(1.dp, if (on) p.ink else p.line, CircleShape).padding(horizontal = 14.dp, vertical = 9.dp))
    }
}

/** Én episode: avkrysning, bilde, tittel og «5. jan. 2026 · 42 min». */
@Composable
private fun Ep88(vm: AppViewModel, e: NrkSesEp88, serie: String) {
    val p = PaperPal.current
    val n = vm.nrk87
    val iKo = e.iKo || n.aktiv88(e.url)
    val ok = nrkKanVelges88(e.kan, e.lastetNed, iKo)
    val on = ok && e.id in n.sok.pick
    val merke = nrkEpMerke88(e.kan, e.label, e.lastetNed, iKo)
    val sub = listOf(nrkDato88(e.dato), e.varighet.orEmpty()).filter { it.isNotEmpty() }.joinToString(" · ")
    Column(Modifier.fillMaxWidth()) {
        Skille87()
        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).toggleable(value = on, enabled = ok, role = Role.Checkbox) { vm.nrkVelg88(e.id) }
            .semantics(mergeDescendants = true) { contentDescription = listOfNotNull(e.tittel, sub.ifEmpty { null }, merke?.first).joinToString(", ") }
            .alpha(if (ok) 1f else .6f).padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            val har = e.lastetNed
            Box(Modifier.size(22.dp).clip(RoundedCornerShape(6.dp)).background(if (on) p.ink else if (har) tone88("ok").copy(alpha = .15f) else Color.Transparent)
                .border(1.5.dp, if (on) p.ink else if (har) tone88("ok") else p.line, RoundedCornerShape(6.dp)), contentAlignment = Alignment.Center) {
                if (on || har) Text("✓", color = if (on) p.bg else tone88("ok"), fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
            Flate88(vm, e.bilde, "", Modifier.width(72.dp).aspectRatio(16f / 9f).clip(RoundedCornerShape(6.dp)).background(flate87(serie)), px = 240)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(e.tittel, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, lineHeight = 19.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (sub.isNotEmpty()) Text(sub, color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, maxLines = 1)
            }
            merke?.let { (t, c) -> Chip87(t, tone88(c)) }
        }
    }
}

/** Bunnlinja på seriesiden: ligger fast nederst over lista. */
@Composable
internal fun SerieBunn88(vm: AppViewModel, modifier: Modifier) {
    val p = PaperPal.current
    val n = vm.nrk87
    val s = n.sok
    val sid = s.ser ?: return
    val x = s.serData[sid]?.data ?: return
    val navn = nrkSesong88(x.sesonger.map { it.navn to it.tilgjengelig }, s.si[sid])
    val eps = navn?.let { s.sesData["$sid/$it"]?.data }.orEmpty()
    val ok = eps.filter { nrkKanVelges88(it.kan, it.lastetNed, it.iKo || n.aktiv88(it.url)) }
    val valgte = ok.count { it.id in s.pick }
    val folger = n.folgAv88(sid) != null
    val navB = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    Column(modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, bottom = navB + 10.dp).shadow(14.dp, RoundedCornerShape(20.dp)).clip(RoundedCornerShape(20.dp))
        .background(p.card).border(1.dp, p.line, RoundedCornerShape(20.dp)).padding(14.dp, 10.dp, 14.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Knapp87(nrkVelgAlle88(valgte, ok.size), enabled = ok.isNotEmpty()) { vm.nrkVelgAlle88(ok.map { it.id }) }
            Knapp87(if (folger) "✓ Følger serien" else "Følg serien", color = if (folger) tone88("ok") else null, enabled = !s.fbusy) { vm.nrkFolgSerie88() }
        }
        Btn43(if (s.lbusy) "Legger i køen …" else nrkHentTekst88(valgte), dark = true, modifier = Modifier.fillMaxWidth().alpha(if (valgte > 0 && !s.lbusy) 1f else .4f),
            enabled = valgte > 0 && !s.lbusy) { vm.nrkHentValgte88() }
        s.serr?.let { Text(it, color = p.lab, fontSize = 13.sp) }
        Text("Følg serien laster ned nye episoder fremover (de to nyeste sesongene), ikke hele arkivet.", color = p.mut, fontSize = 12.sp, lineHeight = 16.sp)
    }
}

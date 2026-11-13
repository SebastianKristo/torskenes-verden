package no.kristo.finanshub.ui

import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/*
 * Prompt 87 (NRKAND): Media → NRK (claude-code-media-nrk-nedlaster.md, fasit Media NRK.dc.html).
 * Én kolonne: Last ned fra NRK → Køen → Serier du følger → Bibliotek (rutenett, og detalj med sesonger og episoder).
 * Kort som i designet: kortflate, 1 dp linje og 20 dp runding. Farger: blå = laster ned, grønn = ferdig/VPN i orden,
 * rød (lab) = feil/VPN stoppet, dempet = i kø/avbrutt. Tilstanden ligger i vm.nrk87 (Nrk87.kt), så lenkefeltet beholder teksten.
 * Biblioteket legges ut rad for rad i den samme lazy-lista (store bibliotek tegnes ikke på én gang).
 */

private val NRK_FLATER87 = listOf(0xFF3B2F28, 0xFF2B3D52, 0xFF7A2E22, 0xFF3C4A3E, 0xFF4A4036, 0xFF2F3A46, 0xFF2E5A5E, 0xFF6A4A1E)

/** Reservefarge for plakaten når NRK-bildet mangler (fast per tittel). */
private fun flate87(tittel: String): Color = Color(NRK_FLATER87[((tittel.hashCode() % NRK_FLATER87.size) + NRK_FLATER87.size) % NRK_FLATER87.size])

@Composable
private fun tone87(t: String): Color {
    val p = PaperPal.current
    val dark = p.card.luminance() < .5f
    return when (t) {
        "ok" -> if (dark) Color(0xFF5FB583) else Color(0xFF2F7A4F)
        "dl" -> if (dark) Color(0xFF6FA3D3) else Color(0xFF2B5D8A)
        "err" -> p.lab
        else -> p.mut
    }
}

/**
 * Kortflate med linje og 20 dp runding. Et kort kan deles i flere biter i lista (topp/bunn av): flaten tegnes da ut over
 * kanten og klippes, så bitene henger sammen som ett kort.
 */
private fun Modifier.kort87(card: Color, line: Color, topp: Boolean = true, bunn: Boolean = true): Modifier = this.clipToBounds().drawBehind {
    val r = 20.dp.toPx()
    val ekstra = r * 2f
    val y = if (topp) 0f else -ekstra
    val h = size.height + (if (topp) 0f else ekstra) + (if (bunn) 0f else ekstra)
    val sw = 1.dp.toPx()
    drawRoundRect(card, Offset(0f, y), Size(size.width, h), CornerRadius(r, r))
    drawRoundRect(line, Offset(sw / 2f, y + sw / 2f), Size(size.width - sw, h - sw), CornerRadius(r, r), style = Stroke(sw))
}

@Composable
private fun Kort87(content: @Composable ColumnScope.() -> Unit) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(bottom = 14.dp).kort87(p.card, p.line).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
}

@Composable
private fun Chip87(text: String, c: Color) {
    Text(text, color = c, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = .4.sp, maxLines = 1,
        modifier = Modifier.clip(CircleShape).background(c.copy(alpha = .13f)).padding(horizontal = 10.dp, vertical = 4.dp))
}

/** Liten pilleknapp som i designet (34 dp), med trykkflate på minst 44 dp. */
@Composable
private fun Knapp87(text: String, color: Color? = null, fylt: Boolean = false, enabled: Boolean = true, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.heightIn(min = 44.dp).alpha(if (enabled) 1f else .5f).clickable(enabled = enabled, role = Role.Button, onClickLabel = text, onClick = onClick), contentAlignment = Alignment.Center) {
        Box(Modifier.height(34.dp).clip(CircleShape).background(if (fylt) p.ink else Color.Transparent).border(1.dp, if (fylt) p.ink else p.line, CircleShape).padding(horizontal = 13.dp), contentAlignment = Alignment.Center) {
            Text(text, color = if (fylt) p.bg else color ?: p.ink, fontWeight = if (fylt) FontWeight.Bold else FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1)
        }
    }
}

@Composable
private fun Mut87(text: String, size: Float = 14f) = Text(text, color = PaperPal.current.mut, fontSize = size.sp, lineHeight = (size * 1.45f).sp)

@Composable
private fun Skille87() = Box(Modifier.fillMaxWidth().height(1.dp).background(PaperPal.current.line))

@Composable
private fun Valg87(options: List<Pair<String, String>>, cur: String, onPick: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        options.forEach { (k, n) -> Pill43(n, cur == k) { onPick(k) } }
    }
}

/* ======================= Fanen ======================= */

@Composable
internal fun Nrk87(vm: AppViewModel, pad: PaddingValues) {
    val n = vm.nrk87
    val s = vm.p43
    val liste = rememberLazyListState()

    // Oppdatering: hvert 2. sekund mens noe er i kø eller lastes ned, ellers hvert 10. Stopper når fanen ikke vises
    // (denne skjermen finnes bare mens NRK-fanen er valgt) og når appen ligger i bakgrunnen.
    val owner = LocalLifecycleOwner.current
    var synlig by remember { mutableStateOf(owner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) }
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _: androidx.lifecycle.LifecycleOwner, e: Lifecycle.Event ->
            if (e == Lifecycle.Event.ON_START) { if (!synlig) vm.tickNrk87(); synlig = true }
            if (e == Lifecycle.Event.ON_STOP) synlig = false
        }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    val pause = nrkPause87(n.jobber.orEmpty().map { it.status })
    LaunchedEffect(synlig, pause, s.mediaOpen) {
        if (synlig && s.mediaOpen) while (true) { delay(pause); vm.tickNrk87() }
    }
    // Åpnet detalj: rull til toppen av Bibliotek-kortet (kortet er element 3 i lista).
    LaunchedEffect(n.valgt?.id) { if (n.valgt != null) runCatching { liste.animateScrollToItem(3) } }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        // Plakat-rutenett som i designet (minst 150 bred), men aldri færre enn to i bredden på telefon.
        val inne = maxWidth - 32.dp - 40.dp
        val cols = ((inne + 12.dp) / (150.dp + 12.dp)).toInt().coerceIn(2, 8)
        LazyColumn(Modifier.fillMaxSize(), state = liste, contentPadding = pad) {
            when {
                n.gammel -> item("gammel") { Kort87 { PSerif("NRK-nedlaster", 26.sp); Mut87("NRK-nedlasteren krever en nyere versjon av Homelab-serveren. Oppdater Homelab og prøv igjen.", 15f) } }
                n.configured == false -> item("tom") { Tom87(vm) }
                n.configured == null && n.jobber == null -> item("henter") { Kort87 { PSerif("NRK-nedlaster", 26.sp); Mut87("Henter …", 15f) } }
                else -> {
                    item("ny") { LastNed87(vm) }
                    item("ko") { Ko87(vm) }
                    item("folg") { Folger87(vm) }
                    bibliotek87(vm, cols)
                }
            }
        }
    }
}

/* ---------------- Tomtilstand ---------------- */

@Composable
private fun Tom87(vm: AppViewModel) {
    Kort87 {
        PSerif("NRK-nedlasteren er ikke satt opp", 26.sp)
        Mut87("Legg inn adressen og tokenet til nrk-dl under Integrasjoner. Tjenesten kjører bak en egen VPN-tunnel til Norge.", 15f)
        if (vm.userIsAdmin) Btn43("Åpne Integrasjoner", dark = true) { vm.p43.mediaOpen = false; vm.openIntegrations43() }
        else Mut87("Be en administrator om å sette den opp.")
    }
}

/* ---------------- Kort 1: Last ned fra NRK ---------------- */

@Composable
private fun LastNed87(vm: AppViewModel) {
    val p = PaperPal.current
    val n = vm.nrk87
    val ctx = LocalContext.current
    val st = n.status
    Kort87 {
        PSerif("Last ned fra NRK", 26.sp)
        if (st != null) {
            val c = tone87(if (st.vpnOk) "ok" else "err")
            Row(Modifier.clip(CircleShape).background(c.copy(alpha = .10f)).border(1.dp, c.copy(alpha = .35f), CircleShape).padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Box(Modifier.size(7.dp).clip(CircleShape).background(c))
                Text(if (st.vpnOk) listOfNotNull("VPN", st.land ?: "NO", st.ip).joinToString(" · ") else "VPN stoppet · køen venter",
                    color = c, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        // Lenkefeltet med «Lim inn». Rød ramme når lenken ikke er fra NRK.
        val ramme = if (n.err != null) p.lab else p.line
        Row(Modifier.fillMaxWidth().heightIn(min = 50.dp).clip(RoundedCornerShape(14.dp)).background(p.bg).border(1.dp, ramme, RoundedCornerShape(14.dp)).padding(start = 14.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (n.url.isEmpty()) Text("https://tv.nrk.no/serie/…", color = p.mut, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                BasicTextField(n.url, { n.url = it.take(2000); n.err = null }, singleLine = true,
                    textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.lab),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, capitalization = KeyboardCapitalization.None, imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = { vm.addNrk87() }), modifier = Modifier.fillMaxWidth())
            }
            Box(Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(10.dp)).clickable(role = Role.Button, onClickLabel = "Lim inn lenke") {
                // Bare innliming i feltet – ingenting lastes ned før «Last ned».
                val tekst = runCatching { (ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)?.primaryClip?.getItemAt(0)?.coerceToText(ctx)?.toString() }.getOrNull()?.trim()
                if (tekst.isNullOrEmpty()) vm.p43.toast = "Utklippstavlen er tom"
                else { n.url = nrkDelt87(tekst) ?: tekst.take(2000); n.err = null; Haptics.select() }
            }.padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
                Text("Lim inn", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
            }
        }
        n.err?.let { Text(it, color = p.lab, fontSize = 14.sp) }
        Btn43(if (n.busy) "Legger i køen …" else "Last ned", dark = true, modifier = Modifier.fillMaxWidth().alpha(if (nrkLenke87(n.url) != null && !n.busy) 1f else .4f), enabled = !n.busy) { vm.addNrk87() }

        PLabel("Type", color = p.mut)
        Valg87(listOf("auto" to "Finn ut selv", "tv" to "Serie", "film" to "Film", "radio" to "Radio"), n.type) { n.type = it }
        PLabel("Kvalitet", color = p.mut)
        Valg87(listOf("best" to "Beste", "1080" to "1080p", "720" to "720p", "540" to "540p"), n.kval) { n.kval = it }

        Toggle43("Følg serien", "Laster ned nye episoder automatisk", n.folg) { n.folg = it }
        // Komprimering vises bare når serveren (nrk-dl) melder at den støtter det.
        st?.komp?.let { k ->
            val on = n.komp ?: k.standard
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(role = Role.Checkbox, onClickLabel = "Komprimer") { n.komp = !on; Haptics.select() },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(22.dp).clip(RoundedCornerShape(6.dp)).background(if (on) p.ink else Color.Transparent).border(1.5.dp, if (on) p.ink else p.line, RoundedCornerShape(6.dp)), contentAlignment = Alignment.Center) {
                    if (on) Text("✓", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
                Column(Modifier.weight(1f)) {
                    Text("Komprimer (H.265, ca. halv størrelse)", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
                    Text(nrkKompSub87(k.standard, k.crf, k.preset), color = p.mut, fontSize = 12.sp)
                }
            }
        }
        Skille87()
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            for (l in listOf("tv/Serie/Season 01/Serie - S01E02 - Tittel.mkv", "movies/Tittel/Tittel.mkv", "podcast/Serie/2026-11-13 - Tittel.m4a"))
                Text(l, color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, lineHeight = 17.sp)
        }
    }
}

/* ---------------- Kort 2: Køen ---------------- */

@Composable
private fun Ko87(vm: AppViewModel) {
    val p = PaperPal.current
    val n = vm.nrk87
    val jobber = n.jobber
    // Ukjent VPN-status (ikke hentet ennå) regnes ikke som stoppet.
    val vpnOk = n.status?.vpnOk != false
    Kort87 {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            PSerif("Køen", 26.sp, modifier = Modifier.weight(1f))
            if (jobber.orEmpty().any { it.status == "ferdig" || it.status == "avbrutt" }) Knapp87("Fjern ferdige") { vm.nrkRydd87() }
        }
        if (!vpnOk) Text("Venter på VPN: tunnelen er ikke i Norge. Køen står stille.", color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.lab.copy(alpha = .10f)).padding(14.dp, 12.dp))
        when {
            jobber == null -> Mut87("Henter køen …", 15f)
            jobber.isEmpty() -> Mut87("Ingenting i køen. Lim inn en lenke fra tv.nrk.no eller radio.nrk.no.", 15f)
            else -> jobber.forEachIndexed { i, j -> key(j.id) { if (i > 0) Skille87(); Jobb87(vm, j, vpnOk) } }
        }
    }
}

@Composable
private fun Jobb87(vm: AppViewModel, j: NrkJobb87, vpnOk: Boolean) {
    val p = PaperPal.current
    val n = vm.nrk87
    val uri = LocalUriHandler.current
    val (chip, tone) = nrkChip87(j.status, vpnOk)
    val c = tone87(tone)
    val venter = !vpnOk && (j.status == "ko" || j.status == "kjorer")
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            // Tittelen åpner programmet hos NRK (bare NRK-lenker åpnes).
            val lenke = nrkLenke87(j.url)
            Text(j.tittel, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 16.sp, lineHeight = 21.sp,
                modifier = Modifier.weight(1f).then(if (lenke != null) Modifier.clickable(role = Role.Button, onClickLabel = "Åpne på NRK") { runCatching { uri.openUri(lenke) } } else Modifier))
            Chip87(chip, c)
        }
        val melding = if (venter) (j.melding?.takeIf { it.startsWith("Venter på VPN") } ?: "Venter på VPN …") else j.melding
        if (!melding.isNullOrBlank()) Mut87(melding)
        if (j.status == "kjorer") {
            val pr = (j.prosent ?: 0.0).coerceIn(0.0, 100.0)
            Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(p.line)) {
                Box(Modifier.fillMaxHeight().fillMaxWidth((pr / 100.0).toFloat()).clip(CircleShape).background(c))
            }
            // Under komprimering gjelder prosenten komprimeringen, og farten byttes med «H.265 · crf N».
            val komp = nrkKomprimerer87(j.status, j.melding)
            val fart = if (komp) listOfNotNull("H.265", n.status?.komp?.crf?.let { "crf $it" }).joinToString(" · ") else nrkFart87(j.fart)
            val deler = listOf("${Math.round(pr)} %", fart, nrkEta87(j.eta), if (j.av != null && j.nr != null) "${j.nr} av ${j.av}" else "").filter { it.isNotEmpty() }
            Text(deler.joinToString("   "), color = p.mut, fontFamily = PaperFonts.mono, fontSize = 12.sp)
        }
        nrkSpart87(j.spart)?.takeIf { j.status == "ferdig" }?.let { Text(it, color = tone87("ok"), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp) }
        if (j.filer.isNotEmpty()) {
            val open = j.id in n.filerOpen
            val lbl = (if (open) "Skjul" else "Vis") + " lagrede filer (${j.filer.size})"
            Text(lbl, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp,
                modifier = Modifier.heightIn(min = 44.dp).clickable(role = Role.Button, onClickLabel = lbl) { n.filerOpen = if (open) n.filerOpen - j.id else n.filerOpen + j.id }.wrapContentHeight())
            if (open) Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                j.filer.forEach { f -> Text(f, color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, lineHeight = 17.sp) }
            }
        }
        val knapper = nrkKnapper87(j.status, j.type)
        if (knapper.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (k in knapper) when (k) {
                "avbryt" -> Knapp87("Avbryt", color = p.lab) { vm.nrkJobb87(j.id, "avbryt") }
                "igjen" -> Knapp87("Prøv igjen") { vm.nrkJobb87(j.id, "igjen") }
                "nye" -> Knapp87("Se etter nye") { vm.nrkJobb87(j.id, "nye") }
                else -> Knapp87("Fjern", color = p.mut) { vm.nrkJobb87(j.id, "fjern") }
            }
        }
    }
}

/* ---------------- Kort 3: Serier du følger ---------------- */

@Composable
private fun Folger87(vm: AppViewModel) {
    val p = PaperPal.current
    val n = vm.nrk87
    val now = System.currentTimeMillis() / 1000L
    Kort87 {
        PSerif("Serier du følger", 26.sp)
        if (n.folger.isEmpty()) Mut87("Du følger ingen serier. Slå på «Følg serien» når du legger inn en lenke.", 15f)
        else n.folger.forEachIndexed { i, f ->
            key(f.id) {
                if (i > 0) Skille87()
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(f.tittel, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Mut87(nrkFolgSub87(f.sjekket, f.siste, f.kvalitet, now), 13f)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Knapp87(if (n.sjekker == f.id) "Sjekker …" else "Sjekk nå", enabled = n.sjekker == null) { vm.nrkSjekk87(f.id) }
                        Knapp87("Slutt å følge", color = p.lab) { vm.nrkSluttFolg87(f.id) }
                    }
                }
            }
        }
    }
}

/* ---------------- Kort 4: Bibliotek ---------------- */

@Composable
private fun Plakat87(vm: AppViewModel, e: NrkElem87, modifier: Modifier, merke: String? = null) {
    val ctx = LocalContext.current.applicationContext
    var bmp by remember(e.bilde) { mutableStateOf<Bitmap?>(Img50.cached(vm.base, e.bilde)) }
    LaunchedEffect(e.bilde) { if (e.bilde != null && bmp == null) Img50.load(ctx, vm.base, vm.account?.token, e.bilde, 640)?.let { bmp = it } }
    Box(modifier.aspectRatio(2f / 3f).clip(RoundedCornerShape(12.dp)).background(flate87(e.tittel))) {
        val b = bmp
        if (b != null) Image(b.asImageBitmap(), e.tittel, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        else Text(e.tittel, color = Color(0xFFF3EFE6), fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 18.sp, lineHeight = 20.sp, maxLines = 4,
            overflow = TextOverflow.Ellipsis, modifier = Modifier.align(Alignment.BottomStart).padding(12.dp))
        if (merke != null) Text(merke, color = Color(0xFFF3EFE6), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, maxLines = 1,
            modifier = Modifier.align(Alignment.TopEnd).padding(8.dp).clip(CircleShape).background(Color(0x8C0E0D0B)).padding(horizontal = 8.dp, vertical = 3.dp))
    }
}

/** Film uten episodeliste ligger i biblioteket fordi fila finnes – da er den lastet ned. */
private fun filmStatus87(e: NrkElem87): String = e.sesonger.firstOrNull()?.episoder?.firstOrNull()?.status ?: "lastet"

@Composable
private fun Rute87(vm: AppViewModel, e: NrkElem87, modifier: Modifier) {
    val p = PaperPal.current
    val film = e.type == "film"
    val total = if (film) 1 else e.antall
    val har = if (film) (if (filmStatus87(e) == "lastet") 1 else 0) else e.lastet
    val sub = if (film) when (filmStatus87(e)) { "lastet" -> "Lastet ned"; "laster" -> "Laster ned"; "ko" -> "I kø"; else -> "Mangler" } else "$har av $total episoder"
    Column(modifier.clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button, onClickLabel = "Åpne ${e.tittel}") { vm.openNrkElem87(e) }, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Plakat87(vm, e, Modifier.fillMaxWidth(), merke = when (e.type) { "film" -> "FILM"; "radio" -> "RADIO"; else -> "${e.sesonger.size} S" })
        Text(e.tittel, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(sub, color = p.mut, fontSize = 12.sp, maxLines = 1)
        Box(Modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(p.line)) {
            val andel = if (total > 0) har.toFloat() / total else 0f
            Box(Modifier.fillMaxHeight().fillMaxWidth(andel.coerceIn(0f, 1f)).background(tone87(if (total > 0 && har >= total) "ok" else "dl")))
        }
    }
}

/** Bibliotek-kortet, lagt ut som biter i lista: topp → rader (plakater eller episoder) → bunn. */
private fun LazyListScope.bibliotek87(vm: AppViewModel, cols: Int) {
    val n = vm.nrk87
    val valgt = n.valgt
    val lib = n.lib
    if (n.libOk == false || lib == null || (lib.isEmpty() && valgt == null)) {
        item("lib-enkel") {
            Kort87 {
                PSerif("Bibliotek", 26.sp)
                Mut87(when {
                    n.libOk == false -> "Biblioteket krever en nyere versjon av nrk-dl."
                    lib == null -> "Henter biblioteket …"
                    else -> "Ingenting i biblioteket ennå. Det du laster ned fra NRK, dukker opp her."
                }, 15f)
            }
        }
        return
    }
    if (valgt != null) { detalj87(vm, valgt); return }

    val vis = lib.filter { n.libFilter == "alle" || it.type == n.libFilter }
    item("lib-topp") {
        val p = PaperPal.current
        Column(Modifier.fillMaxWidth().kort87(p.card, p.line, bunn = false).padding(20.dp, 20.dp, 20.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif("Bibliotek", 26.sp)
            Mut87(nrkSum87(lib.count { it.type == "tv" }, lib.count { it.type == "film" }, lib.count { it.type == "radio" }))
            Valg87(listOf("alle" to "Alle", "tv" to "Serier", "film" to "Filmer", "radio" to "Radio"), n.libFilter) { n.libFilter = it }
            if (vis.isEmpty()) Mut87("Ingenting her ennå.", 15f)
        }
    }
    val rader = vis.chunked(cols)
    items(rader.size, key = { "lib-rad-" + rader[it].first().id }) { i ->
        val p = PaperPal.current
        Row(Modifier.fillMaxWidth().kort87(p.card, p.line, topp = false, bunn = false).padding(20.dp, 0.dp, 20.dp, 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            for (e in rader[i]) key(e.id) { Rute87(vm, e, Modifier.weight(1f)) }
            repeat(cols - rader[i].size) { Spacer(Modifier.weight(1f)) }
        }
    }
    item("lib-bunn") { val p = PaperPal.current; Box(Modifier.fillMaxWidth().height(20.dp).kort87(p.card, p.line, topp = false)) }
}

private fun LazyListScope.detalj87(vm: AppViewModel, e: NrkElem87) {
    val n = vm.nrk87
    val film = e.type == "film"
    val si = (n.sesong[e.id] ?: (e.sesonger.size - 1)).coerceIn(0, (e.sesonger.size - 1).coerceAtLeast(0))
    val ses = e.sesonger.getOrNull(si)
    val eps = ses?.episoder.orEmpty()
    val mangler = eps.filter { it.status == "mangler" }
    item("det-topp") {
        val p = PaperPal.current
        val uri = LocalUriHandler.current
        Column(Modifier.fillMaxWidth().kort87(p.card, p.line, bunn = false).padding(20.dp, 20.dp, 20.dp, 6.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Top) {
                Plakat87(vm, e, Modifier.width(110.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Knapp87("‹ Bibliotek") { n.valgt = null }
                    PSerif(e.tittel, 28.sp, maxLines = 4)
                    e.meta?.let { Mut87(it) }
                }
            }
            e.beskrivelse?.let { Text(it, color = p.ink, fontSize = 15.sp, lineHeight = 22.sp) }
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                when {
                    film && filmStatus87(e) == "mangler" -> Knapp87("Last ned", fylt = true) { vm.nrkHent87(e, eps.filter { it.status == "mangler" }, "Lagt i køen") }
                    film -> Knapp87("Last ned på nytt", fylt = true) { vm.nrkHent87(e, emptyList(), "Lagt i køen") }
                    mangler.isNotEmpty() -> Knapp87("Last ned ${mangler.size} som mangler", fylt = true) {
                        vm.nrkHent87(e, mangler, if (mangler.size == 1) "1 episode lagt i køen" else "${mangler.size} episoder lagt i køen")
                    }
                    else -> Knapp87("Se etter nye", fylt = true) { vm.nrkHent87(e, emptyList(), "Ser etter nye episoder") }
                }
                nrkLenke87(e.url)?.let { l -> Knapp87("Åpne på NRK") { runCatching { uri.openUri(l) } } }
            }
            if (e.sesonger.size > 1) {
                Skille87()
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    e.sesonger.forEachIndexed { i, s -> Pill43(if (e.type == "radio") "${s.nr}" else "Sesong ${s.nr}", i == si) { n.sesong = n.sesong + (e.id to i) } }
                }
            }
            if (n.detBusy) Mut87("Henter episoder …", 13f)
        }
    }
    if (eps.isEmpty()) {
        // Film (eller serie uten episodeliste): én rad.
        item("det-en") {
            val p = PaperPal.current
            Box(Modifier.fillMaxWidth().kort87(p.card, p.line, topp = false, bunn = false).padding(horizontal = 20.dp)) {
                if (film) Episode87(vm, e, null, "FILM", e.tittel, e.meta?.split(" · ")?.lastOrNull(), filmStatus87(e), strek = true)
                else if (!n.detBusy) Mut87("Fant ingen episoder.", 15f)
            }
        }
    } else {
        items(eps.size, key = { "det-ep-${ses?.nr}-$it" }) { i ->
            val p = PaperPal.current
            val ep = eps[i]
            Box(Modifier.fillMaxWidth().kort87(p.card, p.line, topp = false, bunn = false).padding(horizontal = 20.dp)) {
                Episode87(vm, e, ep, nrkEpNr87(e.type, ses?.nr ?: 1, ep.nr), ep.tittel, ep.varighet, ep.status, strek = true)
            }
        }
    }
    item("det-bunn") { val p = PaperPal.current; Box(Modifier.fillMaxWidth().height(20.dp).kort87(p.card, p.line, topp = false)) }
}

@Composable
private fun Episode87(vm: AppViewModel, e: NrkElem87, ep: NrkEp87?, nr: String, tittel: String, sub: String?, status: String, strek: Boolean) {
    val p = PaperPal.current
    val (chip, tone) = nrkEpChip87(status)
    Column(Modifier.fillMaxWidth()) {
        if (strek) Skille87()
        Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(listOfNotNull(nr, sub).joinToString(" · "), color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1)
                Text(tittel, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp, lineHeight = 20.sp)
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Chip87(chip, tone87(tone))
                // «Last ned» bare på det som mangler, og bare når episoden har egen lenke (ellers ville hele serien blitt hentet).
                if (status == "mangler" && ep?.url != null && nrkLenke87(ep.url) != null) Knapp87("Last ned") { vm.nrkHent87(e, listOf(ep), "Lagt i køen") }
            }
        }
    }
}

package no.kristo.finanshub.ui

import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
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
 * Prompt 88 (AND88): Media → Musikk (yubal). Én kolonne: Last ned musikk → Køen → Spillelister du følger.
 * Fasit: public/js/media-musikk.js og «Media Musikk.dc.html». Tilstanden ligger i vm.musikk88 (Musikk88.kt), så lenkefeltet
 * beholder teksten. Samme kort, chips og knapper som NRK-fanen (ui/Nrk87Ui.kt). Oppdatering: hvert 2. sekund mens noe står i
 * køen, ellers hvert 10.; stopper når fanen ikke vises (skjermen finnes bare mens Musikk er valgt) og når appen er i bakgrunnen.
 */

/** Omslag: kvadratisk fargeflate, og bildet fra serverens bildeproxy over når det finnes. */
@Composable
private fun Omslag88(vm: AppViewModel, url: String?, tittel: String, size: Dp, radius: Dp = 8.dp) {
    Box(Modifier.size(size).clip(RoundedCornerShape(radius)).background(flate87(tittel))) {
        NettBilde88(vm, url, Modifier.matchParentSize(), if (size > 80.dp) 480 else 200)
    }
}

/** Bryter som i designet (av/på), 48 dp trykkflate. */
@Composable
private fun Bryter88(on: Boolean, label: String, enabled: Boolean = true, onChange: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.size(56.dp, 48.dp).alpha(if (enabled) 1f else .5f).toggleable(value = on, enabled = enabled, role = Role.Switch) { onChange() }
        .semantics { contentDescription = label }, contentAlignment = Alignment.Center) {
        Box(Modifier.size(44.dp, 26.dp).clip(CircleShape).background(if (on) tone88("ok") else p.line).padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
            Box(Modifier.size(20.dp).clip(CircleShape).background(Color.White))
        }
    }
}

@Composable
internal fun Musikk88(vm: AppViewModel, pad: PaddingValues) {
    val m = vm.musikk88
    val s = vm.p43
    val owner = LocalLifecycleOwner.current
    var synlig by remember { mutableStateOf(owner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) }
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _: androidx.lifecycle.LifecycleOwner, e: Lifecycle.Event ->
            if (e == Lifecycle.Event.ON_START) { if (!synlig) vm.tickMusikk88(); synlig = true }
            if (e == Lifecycle.Event.ON_STOP) synlig = false
        }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    val pause = muPause88(m.jobs.orEmpty().map { it.status })
    LaunchedEffect(synlig, pause, s.mediaOpen) {
        if (synlig && s.mediaOpen) while (true) { delay(pause); vm.tickMusikk88() }
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = pad) {
        when {
            m.gammel -> item("mu-gammel") { Kort87 { PSerif("Musikk", 26.sp); Mut87("Serveren har ikke Musikk ennå – oppdater Homelab.", 15f) } }
            m.configured == false -> item("mu-tom") { MuTom88(vm) }
            m.configured == null && m.err != null -> item("mu-feil") {
                Kort87 {
                    PSerif("Fikk ikke kontakt med yubal", 24.sp)
                    Mut87(m.err.orEmpty(), 15f)
                    Btn43("Prøv igjen", dark = true) { m.err = null; vm.loadMusikk88() }
                }
            }
            m.configured == null -> item("mu-henter") { Kort87 { PSerif("Musikk", 26.sp); Mut87("Henter …", 15f) } }
            else -> {
                item("mu-ny") { MuLastNed88(vm) }
                item("mu-ko") { MuKo88(vm) }
                item("mu-subs") { MuSubs88(vm) }
            }
        }
    }
}

@Composable
private fun MuTom88(vm: AppViewModel) {
    Kort87 {
        PSerif("Musikk er ikke satt opp", 26.sp)
        Mut87("Legg inn adressen til yubal under Integrasjoner. Da kan du laste ned album og spillelister fra YouTube Music til musikkbiblioteket.", 15f)
        if (vm.userIsAdmin) Btn43("Åpne Integrasjoner", dark = true) { vm.p43.mediaOpen = false; vm.openIntegrations43() }
        else Mut87("Be en administrator om å sette den opp.")
    }
}

/* ---------------- Kort 1: Last ned musikk ---------------- */

@Composable
private fun MuLastNed88(vm: AppViewModel) {
    val p = PaperPal.current
    val m = vm.musikk88
    val ctx = LocalContext.current
    Kort87 {
        PSerif("Last ned musikk", 26.sp)
        val ramme = if (m.ferr != null) p.lab else p.line
        Row(Modifier.fillMaxWidth().heightIn(min = 50.dp).clip(RoundedCornerShape(14.dp)).background(p.bg).border(1.dp, ramme, RoundedCornerShape(14.dp)).padding(start = 14.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (m.url.isEmpty()) Text("Album, spilleliste eller sang fra music.youtube.com", color = p.mut, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                BasicTextField(m.url, { m.url = it.take(2000); m.ferr = null; m.pv = null }, singleLine = true,
                    textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.lab),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, capitalization = KeyboardCapitalization.None, imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = { vm.muForhandsvis88() }), modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Lenke fra YouTube Music" })
            }
            Box(Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(10.dp)).clickable(role = Role.Button, onClickLabel = "Lim inn lenke") {
                // Bare innliming i feltet – ingenting hentes eller lastes ned før brukeren trykker.
                val tekst = runCatching { (ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)?.primaryClip?.getItemAt(0)?.coerceToText(ctx)?.toString() }.getOrNull()?.trim()
                if (tekst.isNullOrEmpty()) vm.p43.toast = "Utklippstavlen er tom"
                else { m.url = ytDelt88(tekst) ?: tekst.take(2000); m.ferr = null; m.pv = null; Haptics.select() }
            }.padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
                Text("Lim inn", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
            }
        }
        m.ferr?.let { Text(it, color = p.lab, fontSize = 14.sp) }
        if (m.pv == null) Btn43(if (m.laster) "Henter …" else "Forhåndsvis", dark = true,
            modifier = Modifier.fillMaxWidth().alpha(if (ytLenke88(m.url) != null && !m.laster) 1f else .4f), enabled = !m.laster) { vm.muForhandsvis88() }
        m.pv?.let { Forhandsvisning88(vm, it) }
    }
}

@Composable
private fun Forhandsvisning88(vm: AppViewModel, pv: MuInfo88) {
    val p = PaperPal.current
    val m = vm.musikk88
    val mange = pv.kind != "track"
    val liste = pv.kind == "playlist"
    Skille87()
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.Top) {
        Omslag88(vm, pv.thumbnail, pv.title, 96.dp, 10.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            PLabel(muKind88(pv.kind), color = p.mut)
            Text(pv.title, color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 21.sp, lineHeight = 25.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
            muMeta88(pv.artist, pv.year, pv.trackCount).takeIf { it.isNotEmpty() }?.let { Text(it, color = p.mut, fontSize = 13.5.sp) }
            muKilde88(pv.codec, pv.bitrate)?.let { Text(it, color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp) }
        }
    }
    if (mange) {
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Pille88("Alle spor", m.typ == "alle") { m.typ = "alle" }
            Pille88("Bare de første", m.typ == "max") { m.typ = "max" }
        }
        if (m.typ == "max") Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            BasicTextField(m.maxN, { v -> m.maxN = v.filter { it.isDigit() }.take(5) }, singleLine = true,
                textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontFamily = PaperFonts.mono), cursorBrush = SolidColor(p.lab),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                modifier = Modifier.width(96.dp).heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(12.dp))
                    .padding(horizontal = 12.dp, vertical = 13.dp).semantics { contentDescription = "Antall spor" })
            Text("spor (1–10000)", color = p.mut, fontSize = 13.sp)
        }
    }
    if (liste) Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(value = m.folg, role = Role.Switch) { m.folg = it; Haptics.select() }
        .semantics(mergeDescendants = true) { stateDescription = if (m.folg) "På" else "Av" }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Følg spillelisten (nye sanger lastes ned automatisk)", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, modifier = Modifier.weight(1f))
        Box(Modifier.size(44.dp, 26.dp).clip(CircleShape).background(if (m.folg) tone88("ok") else p.line).padding(3.dp), contentAlignment = if (m.folg) Alignment.CenterEnd else Alignment.CenterStart) {
            Box(Modifier.size(20.dp).clip(CircleShape).background(Color.White))
        }
    }
    Btn43(if (m.starter) "Legger til …" else if (liste && m.folg) "Følg og last ned" else "Last ned", dark = true, modifier = Modifier.fillMaxWidth(), enabled = !m.starter) { vm.muStart88() }
    Text("Lagres som ${m.format} i musikkbiblioteket (Navidrome)", color = p.mut, fontSize = 12.5.sp)
    Knapp87("Avbryt", color = p.mut) { m.pv = null }
}

/* ---------------- Kort 2: Køen ---------------- */

@Composable
private fun MuKo88(vm: AppViewModel) {
    val p = PaperPal.current
    val m = vm.musikk88
    val jobs = m.jobs.orEmpty()
    Kort87 {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            PSerif("Køen", 26.sp, modifier = Modifier.weight(1f))
            if (jobs.any { muFerdig88(it.status) }) Knapp87("Fjern ferdige") { vm.muHandling88("rydd") }
        }
        m.err?.let { Text(it, color = p.lab, fontSize = 14.sp) }
        m.aerr?.let { Text(it, color = p.lab, fontSize = 14.sp) }
        if (jobs.isEmpty()) Mut87("Ingenting i køen.", 15f)
        else jobs.forEachIndexed { i, j -> key(j.id) { if (i > 0) Skille87(); MuJobb88(vm, j) } }
    }
}

@Composable
private fun MuJobb88(vm: AppViewModel, j: MuJob88) {
    val p = PaperPal.current
    val (chip, tone) = muChip88(j.status)
    val c = tone88(tone)
    val tittel = listOfNotNull(j.info?.title, j.info?.artist).joinToString(" – ").ifBlank { j.url ?: "Ukjent" }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        Omslag88(vm, j.info?.thumbnail, tittel, 52.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(tittel, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp, lineHeight = 20.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Chip87(chip, c)
            }
            if (muLinje88(j.status)) Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(p.line).semantics { contentDescription = "Fremdrift ${Math.round(j.progress)} %" }) {
                Box(Modifier.fillMaxHeight().fillMaxWidth((j.progress / 100.0).toFloat().coerceIn(0f, 1f)).clip(CircleShape).background(c))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(muTall88(j.status, j.info?.trackCount, j.ok, j.feilet, j.hoppet), color = p.mut, fontFamily = PaperFonts.mono, fontSize = 12.sp, modifier = Modifier.weight(1f))
                Text(if (j.source == "scheduler") "Automatisk" else "Manuell", color = p.mut, fontFamily = PaperFonts.mono, fontSize = 12.sp)
            }
            if (muFerdig88(j.status)) Knapp87("Fjern", color = p.mut) { vm.muHandling88("fjern", j.id) }
            else Knapp87("Avbryt", color = p.lab) { vm.muHandling88("avbryt", j.id) }
        }
    }
}

/* ---------------- Kort 3: Spillelister du følger ---------------- */

@Composable
private fun MuSubs88(vm: AppViewModel) {
    val p = PaperPal.current
    val m = vm.musikk88
    val subs = m.subs.orEmpty()
    val now = System.currentTimeMillis()
    Kort87 {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            PSerif("Spillelister du følger", 24.sp, modifier = Modifier.weight(1f), maxLines = 2)
            if (subs.isNotEmpty()) Knapp87(if (m.sy == "alle") "Synker …" else "Synk alle", enabled = m.sy == null) { vm.muHandling88("synkalle") }
        }
        m.planPaa?.let { paa ->
            Text(muPlan88(paa, m.planNeste?.let { muNar88(it, now, java.util.TimeZone.getDefault()) }, subs.count { it.enabled }, subs.size), color = p.mut, fontSize = 12.5.sp)
        }
        if (subs.isEmpty()) Mut87("Du følger ingen spillelister.", 15f)
        else subs.forEachIndexed { i, x -> key(x.id) { if (i > 0) Skille87(); MuRad88(vm, x, now) } }
    }
}

@Composable
private fun MuRad88(vm: AppViewModel, x: MuSub88, now: Long) {
    val p = PaperPal.current
    val m = vm.musikk88
    val apen = m.open == x.id
    Column(Modifier.fillMaxWidth().alpha(if (x.enabled) 1f else .75f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        // Hele venstre del (omslag, navn, «Synket …») er én knapp som åpner sangene; pila roterer når lista er åpen.
        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button, onClickLabel = if (apen) "Skjul sangene" else "Vis sangene") { vm.muApne88(x.id) },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Omslag88(vm, x.thumbnail, x.name, 52.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(x.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(muSubSub88(x.synket, x.max, now), color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text("›", color = p.mut, fontSize = 22.sp, modifier = Modifier.rotate(if (apen) 90f else 0f))
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Bryter88(x.enabled, if (x.enabled) "Slå av automatisk synk" else "Slå på automatisk synk", enabled = m.tog == null) { vm.muHandling88("tog", x.id) }
            Knapp87(if (m.sy == x.id) "Synker …" else "Synk nå", enabled = m.sy == null) { vm.muHandling88("synk", x.id) }
            Knapp87("Slutt å følge", color = p.lab) { vm.muHandling88("slett", x.id) }
        }
        if (apen) Spor88(vm, x)
    }
}

@Composable
private fun Spor88(vm: AppViewModel, x: MuSub88) {
    val p = PaperPal.current
    val c = vm.musikk88.spor[x.id]
    val d = c?.d
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (d == null) {
            Text(c?.feil ?: "Henter sangene …", color = if (c?.feil != null) p.lab else p.mut, fontFamily = PaperFonts.mono, fontSize = 12.sp)
            if (c?.feil != null) Knapp87("Prøv igjen") { vm.loadMuSpor88(x.id, true) }
        } else {
            val sum = if (d.available && d.tracks.isNotEmpty()) muSporSum88(d.tracks.map { it.status }) else muSynkSum88(d.total, d.synket, d.ok, d.feilet, d.hoppet, d.fantes)
            Text(sum, color = p.mut, fontFamily = PaperFonts.mono, fontSize = 12.sp)
            if (d.tracks.isEmpty()) Mut87(d.message ?: "Sanglista er ikke tilgjengelig fra yubal", 14f)
            else LazyColumn(Modifier.fillMaxWidth().heightIn(max = 420.dp).clip(RoundedCornerShape(12.dp)).border(1.dp, p.line, RoundedCornerShape(12.dp))) {
                items(d.tracks.size, key = { "t$it" }) { i ->
                    val t = d.tracks[i]
                    Column {
                        if (i > 0) Skille87()
                        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 12.dp, vertical = 8.dp).semantics(mergeDescendants = true) {},
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("${i + 1}", color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, modifier = Modifier.width(26.dp))
                            Column(Modifier.weight(1f)) {
                                Text(t.title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                t.artist?.let { Text(it, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                            }
                            muMmss88(t.duration).takeIf { it.isNotEmpty() }?.let { Text(it, color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp) }
                            muSporChip88(t.status)?.let { (tx, tn) -> Chip87(tx, tone88(tn)) }
                        }
                    }
                }
            }
        }
    }
}

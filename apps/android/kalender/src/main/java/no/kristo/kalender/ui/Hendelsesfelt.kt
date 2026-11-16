package no.kristo.kalender.ui

import androidx.compose.runtime.saveable.rememberSaveable
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import no.kristo.kalender.KAddr44
import no.kristo.kalender.KAtt44
import no.kristo.kalender.KEv
import no.kristo.kalender.KNewForm
import no.kristo.kalender.KUser44
import no.kristo.kalender.Kal44
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red
import no.kristo.kalender.today
import android.os.Build
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.window.Dialog
import no.kristo.kalender.Hap
import no.kristo.kalender.Kal46Guard
import no.kristo.kalender.Kal46Prefs
import no.kristo.kalender.Kal46Qr
import no.kristo.kalender.Kal46Rask
import no.kristo.kalender.setPref46

/* Feltene i hendelsesarkene (prompt 44 og 46): «Sted eller adresse» med forslag, DELTAKERE, Media-utgivelse og deltakere i
 * detaljarket, «Kunne ikke åpne ny hendelse» og «✦ Glimt» / sted i GLIMT FORSTÅR. Fasit: Kalender App.dc.html og Kalender.dc.html. */

/* ---------------- Sted eller adresse ---------------- */

@Composable
fun AddrField44(vm: KalVm, f: KNewForm) {
    val k = LocalK.current
    var focused by remember { mutableStateOf(false) }
    var sug by remember { mutableStateOf<List<KAddr44>>(emptyList()) }
    var q by rememberSaveable { mutableStateOf("") }
    var picked by remember { mutableStateOf(false) }
    // 280 ms etter siste tastetrykk, fra 3 tegn. Bare siste søk vises (LaunchedEffect avbrytes ved ny tekst).
    LaunchedEffect(q) {
        if (q.trim().length < 3) { sug = emptyList(); return@LaunchedEffect }
        delay(280)
        sug = Kal44.addresses(vm.session, q)
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.fillMaxWidth().height(40.dp).drawBehind { drawLine(k.line2, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }.padding(horizontal = 2.dp),
            contentAlignment = Alignment.CenterStart) {
            if (f.loc.isEmpty()) Tx("Sted eller adresse", man(KType.body, FontWeight.Medium, k.mut2))
            BasicTextField(f.loc, { v ->
                vm.nf = vm.nf?.copy(loc = v, lat = null, lon = null)
                if (picked) picked = false else q = v
            }, Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused; if (!it.isFocused) sug = emptyList() }.semantics { contentDescription = "Sted eller adresse" },
                textStyle = man(KType.body, FontWeight.Medium, k.ink), singleLine = true, cursorBrush = SolidColor(Red))
        }
        // Lista krymper aldri (egen høyde per rad, minst 48 dp) – arket ruller.
        if (focused && sug.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).border(1.dp, k.line, RoundedCornerShape(14.dp)).background(k.card)) {
            sug.forEachIndexed { i, a ->
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).then(if (i > 0) Modifier.drawBehind { drawLine(k.line, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) } else Modifier)
                    .tap(a.full) {
                        picked = true
                        vm.nf = vm.nf?.copy(loc = a.full, lat = a.lat, lon = a.lon)
                        sug = emptyList()
                    }.padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Svg("M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 7.8a2.2 2.2 0 1 0 0 4.4a2.2 2.2 0 1 0 0-4.4", 16.dp, Red, 2.2f)
                    Column(Modifier.weight(1f)) {
                        Tx(a.street, man(KType.callout, FontWeight.SemiBold, k.ink))
                        if (a.place.isNotBlank()) Tx(a.place, man(KType.footnote, FontWeight.Medium, k.mut))
                    }
                }
            }
            Box(Modifier.fillMaxWidth().drawBehind { drawLine(k.line, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }.padding(horizontal = 12.dp, vertical = 6.dp)) {
                Tx("ADRESSER FRA KARTVERKET", mono(KType.caption, k.mut, .1f))
            }
        }
    }
}

/* ---------------- Deltakere ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun People44(vm: KalVm, f: KNewForm) {
    val k = LocalK.current
    var users by remember { mutableStateOf<List<KUser44>>(emptyList()) }
    var me by remember { mutableStateOf("") }
    var em by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        val s = vm.session ?: return@LaunchedEffect
        val (u, m) = Kal44.directory(s)
        users = u; me = m
    }
    fun setAtt(l: List<KAtt44>) { vm.nf = vm.nf?.copy(att = l) }
    fun add() {
        val v = em.trim().lowercase()
        if (!Kal44.validEmail(v) || f.att.any { it.email == v }) return
        no.kristo.kalender.Hap.tick()
        setAtt(f.att + KAtt44(email = v))
        em = ""
    }
    val from = me.ifBlank { "din e-postadresse" }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Label("DELTAKERE")
        if (users.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            users.forEach { u ->
                val on = f.att.any { it.userId == u.id }
                Row(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(if (on) k.ink else Color.Transparent)
                    .border(1.dp, if (on) k.ink else k.line, RoundedCornerShape(18.dp))
                    .tap(u.name) { no.kristo.kalender.Hap.tick(); setAtt(if (on) f.att.filter { it.userId != u.id } else f.att + KAtt44(userId = u.id, email = u.email.ifBlank { null }, name = u.name)) }
                    .padding(start = 4.dp, end = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Box(Modifier.size(28.dp).clip(CircleShape).background(Color(u.color)), contentAlignment = Alignment.Center) { Tx(u.name.take(1).uppercase(), man(KType.caption, FontWeight.ExtraBold, Color.White)) }
                    Tx(u.name + if (on) " ✓" else "", man(KType.footnote, FontWeight.Bold, if (on) k.bg else k.ink))
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(12.dp)).border(1.dp, k.line, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp), contentAlignment = Alignment.CenterStart) {
                if (em.isEmpty()) Tx("E-post til andre, f.eks. ola@firma.no", man(KType.subheadline, FontWeight.Medium, k.mut2))
                BasicTextField(em, { em = it }, Modifier.fillMaxWidth().semantics { contentDescription = "E-post til andre" }, textStyle = man(KType.subheadline, FontWeight.Medium, k.ink), singleLine = true,
                    cursorBrush = SolidColor(Red), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done, autoCorrectEnabled = false),
                    keyboardActions = KeyboardActions(onDone = { add() }))
            }
            InkPill("Legg til", { add() }, h = 40.dp, padH = 14.dp, fs = KType.subheadline)
        }
        f.att.filter { it.userId == null }.forEach { a ->
            val m = a.email ?: a.name
            Row(Modifier.fillMaxWidth().heightIn(min = 40.dp).drawBehind { drawLine(k.line, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(28.dp).clip(CircleShape).background(k.line), contentAlignment = Alignment.Center) { Tx(m.take(1).uppercase(), man(KType.caption, FontWeight.ExtraBold, k.ink)) }
                Tx(m, man(KType.subheadline, FontWeight.Medium, k.ink), Modifier.weight(1f))
                Tx(a.label, man(KType.caption, FontWeight.Medium, k.mut))
                Box(Modifier.size(48.dp).tap("Fjern $m") { setAtt(f.att.filter { it.id != a.id }) }, contentAlignment = Alignment.Center) { Svg(Ic.CLOSE, 14.dp, k.mut, 2.2f) }
            }
        }
        Tx(if (f.att.isEmpty()) "Velg brukere i appen, eller skriv e-posten til noen utenfor. De får en invitasjon fra $from."
            else "Brukere i appen får hendelsen i sin kalender. Andre får en vanlig e-post med invitasjon (.ics) sendt fra $from og kan svare Ja, Kanskje eller Nei.",
            man(KType.footnote, FontWeight.Medium, k.mut), maxLines = 4)
    }
}

/* ---------------- Detaljarket ---------------- */

/** Media-utgivelse: episode/film, status fra Media og «Åpne i Media» (Homelab-appen). Skrivebeskyttet. */
@Composable
fun MediaInfo44(e: KEv) {
    val k = LocalK.current
    val x = e.x44 ?: return
    val ctx = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Tx(if (x.movie) "Film" else "Episode", man(KType.callout, FontWeight.Medium, k.mut))
            Tx(e.note ?: "–", man(KType.callout, FontWeight.Bold, k.ink))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Tx("Status i Media", man(KType.callout, FontWeight.Medium, k.mut))
            Tx(x.mediaStatus, man(KType.callout, FontWeight.Bold, k.ink))
        }
        Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(22.dp)).background(k.ink).tap("Åpne i Media") {
            val link = x.link.replace("papir://", "homelab://").ifBlank { "homelab://media" }
            runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.onFailure {
                runCatching { ctx.packageManager.getLaunchIntentForPackage("no.kristo.finanshub")?.let { i -> ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } }
            }
        }, contentAlignment = Alignment.Center) { Tx("Åpne i Media ›", man(KType.callout, FontWeight.Bold, k.bg)) }
        Tx("Fra Sonarr og Radarr · endres i Media, ikke her.", man(KType.footnote, FontWeight.Medium, k.mut))
    }
}

@Composable
fun AttList44(att: List<KAtt44>) {
    val k = LocalK.current
    if (att.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Label("DELTAKERE")
        att.forEach { a ->
            val n = a.name.ifBlank { a.email ?: "" }
            Row(Modifier.fillMaxWidth().heightIn(min = 34.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(26.dp).clip(CircleShape).background(k.line), contentAlignment = Alignment.Center) { Tx(n.take(1).uppercase(), man(KType.caption, FontWeight.ExtraBold, k.ink)) }
                Tx(n, man(KType.subheadline, FontWeight.Medium, k.ink), Modifier.weight(1f))
                Tx(a.label, man(KType.footnote, FontWeight.Bold, k.mut))
            }
        }
    }
}

/** Arket kom ikke fram: feilmelding med «Prøv igjen» i stedet for grå skjerm. */
@Composable
fun NewFail46(vm: KalVm, modifier: Modifier = Modifier) {
    val k = LocalK.current
    if (Kal46Guard.failed == null) return
    Column(
        modifier.padding(horizontal = 16.dp).widthIn(max = 420.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(k.card)
            .border(1.dp, k.line, RoundedCornerShape(20.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Tx("Kunne ikke åpne ny hendelse", man(KType.callout, FontWeight.Bold, k.ink))
        Tx("Prøv igjen, eller skriv hendelsen i feltet nederst.", man(KType.subheadline, FontWeight.Medium, k.mut), maxLines = 3)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            InkPill("Prøv igjen", { Hap.tick(); Kal46Guard.retry(vm) })
            LinePill("Lukk", { Hap.tick(); Kal46Guard.failed = null })
        }
    }
}

/** «✦ Glimt» / «Glimt tenker …» ved GLIMT FORSTÅR. */
@Composable
fun RaskBadge46(glimt: Boolean) {
    val k = LocalK.current
    when {
        Kal46Rask.thinking -> Tx("Glimt tenker …", man(KType.caption, FontWeight.Bold, k.mut))
        glimt -> Tx("✦ Glimt", man(KType.caption, FontWeight.Bold, k.acc))
    }
}

@Composable
fun RaskPlace46(loc: String, address: String) {
    val k = LocalK.current
    if (loc.isBlank()) return
    Tx("📍 " + (if (address.isBlank()) loc else "$loc · $address"), man(KType.footnote, FontWeight.SemiBold, k.ink), maxLines = 2)
}

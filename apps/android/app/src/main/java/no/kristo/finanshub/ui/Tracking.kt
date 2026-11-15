package no.kristo.finanshub.ui

import android.Manifest
import android.graphics.Bitmap
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import no.kristo.finanshub.*
import no.kristo.finanshub.ui.designsystem.HomelabType

/* ---------------- Felles ---------------- */

/** Transportørmerket: initialer på merkefargen. */
@Composable
internal fun CarrierBadge(ini: String, color: Long, fg: Long, size: Int = 40, id: String? = null) {
    // Kjente transportører får merket fra serverens SVG (tegnet i CarrierMark); andre får initialer på merkefargen.
    val key = carrierMarkId(id, ini)
    // Prompt 42: PostNord-logoen er pakket med appen (res/drawable/carrier_postnord.xml), aldri blå boks med teksten.
    if (key == "postnord") { PostNordLogo42(size); return }
    if (key != null) { CarrierMark(key, size); return }
    Box(Modifier.size(size.dp).clip(RoundedCornerShape((size * 0.22f).dp)).background(Color(color)), contentAlignment = Alignment.Center) {
        Text(ini, color = Color(fg), fontWeight = FontWeight.Black, fontSize = (size * if (ini.length > 2) 0.28f else 0.36f).sp, maxLines = 1)
    }
}

/* ---------------- Sporing (Homelab-fane) ---------------- */

/* ---------------- Homelab-hjem: karusell med klokke og vær + pakker ---------------- */

/*
 * Sporing (prompt 22): riktig logo for fraktselskap (bare manuelt kontrollerte filer i logobiblioteket, ellers fargefyll med navn),
 * siste hendelse, feiltekst ved mislykket oppdatering og tidslinje med faktisk status.
 */

/** Fraktselskapets logo: fil fra logobiblioteket, ellers merkefarge med navnet (aldri et tilfeldig favicon). */
@Composable
internal fun CarrierLogo(vm: AppViewModel, id: String, name: String, ini: String, color: Long, fg: Long, size: Int) {
    var bmp by remember(id) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(id) { bmp = runCatching { vm.carrierRegLogo(CARRIER_DOMAINS[id], name) }.getOrNull() }
    val b = bmp
    if (b == null) CarrierBadge(ini, color, fg, size, id)
    else Box(Modifier.size(size.dp).clip(RoundedCornerShape((size * .22f).dp)).background(Color.White), contentAlignment = Alignment.Center) {
        Image(b.asImageBitmap(), null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize().padding((size * .1f).dp))
    }
}

/** ISO-tid (med eller uten sone) til «18.10 06:12». */
internal fun trkTime(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    val z = ZoneId.systemDefault()
    val t: LocalDateTime = runCatching { Instant.parse(iso).atZone(z).toLocalDateTime() }.getOrNull()
        ?: runCatching { OffsetDateTime.parse(iso).atZoneSameInstant(z).toLocalDateTime() }.getOrNull()
        ?: runCatching { LocalDateTime.parse(iso.take(16)) }.getOrNull()
        ?: runCatching { LocalDate.parse(iso.take(10)).atStartOfDay() }.getOrNull()
        ?: return iso
    return "%02d.%02d %02d:%02d".format(t.dayOfMonth, t.monthValue, t.hour, t.minute)
}

private fun clockOf(iso: String?): String = trkTime(iso).substringAfter(' ', "")

/** Status som vises: «Registrert» vises ikke som sann når siste oppdatering feilet. */
internal fun trkStatusText(s: Shipment): String = if (s.updateError != null && s.status == "registered") "Venter på status" else s.statusText

/** Høyre side av statuslinja: hentested, forventet levering, eller «Ingen leveringsdato ennå» bare for Registrert uten estimat. */
internal fun trkEtaText(s: Shipment): String {
    s.pickup?.let { pk -> if (s.ready) return pk.name + (pk.deadline?.let { " · frist " + trkTime(it).substringBefore(' ') } ?: "") }
    s.estimatedDelivery?.let { e -> val d = runCatching { LocalDate.parse(e.take(10)) }.getOrNull(); if (d != null && !s.done) return "Ventet %02d.%02d".format(d.dayOfMonth, d.monthValue) }
    if (s.status == "registered" && s.estimatedDelivery == null && s.eta.isBlank()) return if (s.updateError != null) "" else "Ingen leveringsdato ennå"
    return s.etaText
}

/** Siste hendelse («Ankommet terminal · Oslo · 18.10 06:12») og feilteksten («Kunne ikke oppdatere · prøver igjen 20:15»). */
@Composable
internal fun TrkEventLines(s: Shipment) {
    val p = PaperPal.current
    s.lastEvent?.let { e ->
        Text(listOfNotNull(e.text, e.place?.takeIf { it.isNotBlank() }, trkTime(e.time).takeIf { it.isNotBlank() }).joinToString(" · "),
            color = p.ink.copy(alpha = .8f), fontSize = HomelabType.footnote.fontSize, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
    s.updateError?.let { e ->
        val retry = clockOf(e.retryAt)
        Text("Kunne ikke oppdatere" + (if (retry.isNotBlank()) " · prøver igjen $retry" else "") + (e.text.takeIf { it.isNotBlank() && it.length < 60 }?.let { " · $it" } ?: ""),
            color = p.lab, fontSize = HomelabType.caption.fontSize, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

/** Tidslinjen (Registrert · Hentet · I transport · Hentested · Levert) med dato og klokkeslett under siste nådde steg. */
@Composable
internal fun TrkTimeline(s: Shipment) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val info = s.stepInfo.takeIf { it.size == s.steps.size }
    val reached: (Int) -> Boolean = { i -> info?.get(i)?.done ?: (i <= s.step) }
    val lastReached = (s.steps.indices).lastOrNull { reached(it) } ?: 0
    val lastTime = info?.get(lastReached)?.at ?: s.lastEvent?.time ?: s.events.firstOrNull()?.raw
    Column(Modifier.fillMaxWidth().padding(top = 4.dp)) {
        s.steps.forEachIndexed { i, label ->
            val on = reached(i)
            val cur = i == lastReached
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier.size(14.dp).clip(CircleShape).background(if (on && !cur) p.ink else if (cur) (if (s.done) p.pos else p.lab) else Color.Transparent)
                            .border(2.dp, if (on || cur) Color.Transparent else p.line, CircleShape),
                    )
                    if (i < s.steps.size - 1) Box(Modifier.width(2.dp).height(22.dp).background(if (reached(i + 1)) p.ink else p.line))
                }
                Column(Modifier.weight(1f).padding(bottom = 6.dp)) {
                    Text(label, color = if (on) p.ink else p.mut, fontWeight = if (cur) FontWeight.Bold else FontWeight.Medium, fontSize = HomelabType.subheadline.fontSize)
                    val t = info?.get(i)?.at?.let(::trkTime) ?: if (cur) trkTime(lastTime) else ""
                    if (t.isNotBlank() && (cur || info != null)) Text(t, color = p.mut, fontSize = HomelabType.caption.fontSize, fontFamily = PaperFonts.mono)
                }
            }
        }
        if (s.events.isNotEmpty()) {
            PLabel("Hendelser", modifier = Modifier.padding(top = 6.dp, bottom = 4.dp))
            s.events.take(6).forEach { e ->
                Row(Modifier.padding(vertical = 3.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(trkTime(e.at?.toString() ?: e.raw), color = p.mut, fontSize = HomelabType.caption.fontSize, fontFamily = PaperFonts.mono, modifier = Modifier.width(78.dp))
                    Text(listOf(e.status, e.location).filter { it.isNotBlank() }.joinToString(" · "), color = p.ink, fontSize = HomelabType.footnote.fontSize, modifier = Modifier.weight(1f))
                }
            }
        }
        Text("Åpne hos ${s.carrierName} ↗", color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = HomelabType.subheadline.fontSize,
            modifier = Modifier.padding(top = 8.dp).clip(CircleShape).clickable { openLink(ctx, s.url.ifBlank { carrierTrackUrl(s.carrier, s.trackingNo) }) }.padding(vertical = 4.dp))
    }
}

/*
 * Prompt 26 (ANDROID-B): Sporing – overstyr transportøren.
 *  - Ny pakke: under sporingsnummeret «✦ Auto · Bring» (det som gjenkjennes) og Posten, Bring, PostNord, DHL, Helthjem,
 *    UPS, Budbee, Instabox og ParcelsApp.
 *  - Eksisterende pakke: hold inne og velg én pakke → SPOR VIA med de samme valgene; «Auto (…)» går tilbake til automatisk.
 */

@Composable
private fun CarChip26(text: String, on: Boolean, dark: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    val bg = when { on && dark -> p.bg; on -> p.ink; else -> Color.Transparent }
    val fg = when { on && dark -> p.ink; on -> p.bg; dark -> p.bg; else -> p.ink }
    val bd = when { on && dark -> p.bg; on -> p.ink; dark -> Color.White.copy(alpha = .35f); else -> p.line }
    Box(
        Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).background(bg).border(1.dp, bd, RoundedCornerShape(16.dp))
            .clickable(role = Role.RadioButton, onClickLabel = text, onClick = onClick).padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = fg, fontSize = HomelabType.footnote.fontSize, fontWeight = FontWeight.SemiBold, maxLines = 1) }
}

/** Valgene ved ny pakke (vannrett rad): null = automatisk. */
@Composable
internal fun CarrierChips26(no: String, selected: String?, onPick: (String?) -> Unit) {
    val clean = no.uppercase().filter { it.isLetterOrDigit() }
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        CarChip26("✦ Auto" + if (clean.length >= 6) " · " + trkGuessName26(clean) else "", selected == null, dark = false) { onPick(null) }
        TRK26_CARS.forEach { (k, n) -> CarChip26(n, selected == k, dark = false) { onPick(k) } }
    }
}

/** SPOR VIA (mørkt kort) når nøyaktig én pakke er valgt. Pakken spores med en gang via valgt tjeneste. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TrkSporVia26(vm: AppViewModel, list: List<Shipment>) {
    val p = PaperPal.current
    if (vm.trkPicked.size != 1) return
    val s = list.firstOrNull { it.id in vm.trkPicked } ?: return
    val ov = vm.trkOverride26(s)
    val auto = s.carrierDetectedName ?: s.carrierDetected?.let(::trkCarName26) ?: if (ov == null) s.carrierName else trkGuessName26(s.trackingNo)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.ink).padding(14.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("SPOR VIA", color = p.bg.copy(alpha = .75f), fontSize = HomelabType.caption.fontSize, fontWeight = FontWeight.SemiBold, fontFamily = PaperFonts.mono, letterSpacing = 1.2.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            CarChip26("Auto ($auto)", ov == null, dark = true) { if (ov != null) vm.trkSetOverride26(s, null) }
            TRK26_CARS.forEach { (k, n) -> CarChip26(n, ov == k, dark = true) { if (ov != k) vm.trkSetOverride26(s, k) } }
        }
    }
}

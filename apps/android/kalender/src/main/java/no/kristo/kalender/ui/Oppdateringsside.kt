package no.kristo.kalender.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import no.kristo.kalender.Hap
import no.kristo.kalender.KEv
import no.kristo.kalender.Kal43Upd
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.MN
import no.kristo.kalender.Red
import no.kristo.kalender.WD
import no.kristo.kalender.hm
import no.kristo.kalender.jsDay
import no.kristo.kalender.today
import java.time.LocalDate
import android.os.Build
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.window.Dialog
import no.kristo.kalender.Kal46Guard
import no.kristo.kalender.Kal46Prefs
import no.kristo.kalender.Kal46Qr
import no.kristo.kalender.Kal46Rask
import no.kristo.kalender.setPref46
import no.kristo.kalender.KLight

/* Programvareoppdatering (prompt 43 og 46). Fasit: Kalender Oppdatering.dc.html (variant android). Logikken: Oppdatering.kt. */

/* ---------------- Programvareoppdatering (Android) ---------------- */

private fun mb(b: Long): String = "%.1f".format(b / 1_000_000.0).replace('.', ',')

/** Undertekst på raden i Innstillinger. */
fun updSub43(ctx: android.content.Context): String {
    val r = Kal43Upd.rel
    val cur = "Kalender ${Kal43Upd.versionName(ctx)} (${Kal43Upd.versionCode(ctx)})"
    return if (r != null && (Kal43Upd.phase == "avail" || Kal43Upd.phase == "ready")) "$cur · ${r.version} er klar" else cur
}

@Composable
fun UpdatePage43(vm: KalVm) {
    val k = LocalK.current
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val u = Kal43Upd
    BackHandler(true) { u.pageOpen = false }
    LaunchedEffect(Unit) { u.afterStart(ctx) }
    Column(Modifier.fillMaxSize().background(k.bg).tap(null) {}.verticalScroll(rememberScrollState()).padding(horizontal = 18.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Spacer(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(Modifier.size(56.dp).shadow(4.dp, RoundedCornerShape(14.dp)).clip(RoundedCornerShape(14.dp)).background(KLight.card), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.fillMaxWidth().height(17.dp).background(Red), contentAlignment = Alignment.Center) { Tx(WD[today().jsDay].take(3).uppercase(), mono(9.sp, /* ukedagen i det lille app-ikonet */ Color.White)) }
                Tx("${today().dayOfMonth}", news(KType.title3, KLight.ink))
            }
            Column(Modifier.weight(1f)) {
                Tx("Programvareoppdatering", news(KType.title3, k.ink), maxLines = 2)
                Tx(Kal43Upd.currentLabel(ctx), man(KType.subheadline, FontWeight.Medium, k.mut))
            }
            Box(Modifier.size(48.dp).tap("Lukk") { u.pageOpen = false }, contentAlignment = Alignment.Center) { Svg(Ic.CLOSE, 18.dp, k.mut, 2.2f) }
        }
        @Composable
        fun card(bd: Color = k.line, w: Dp = 1.dp, body: @Composable () -> Unit) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(k.card).border(w, bd, RoundedCornerShape(18.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { body() }
        }
        when (u.phase) {
            "check" -> card { Tx("Ser etter oppdateringer på " + u.host46.ifBlank { "serveren" } + " …", man(KType.callout, FontWeight.Bold, k.ink), maxLines = 2) }
            "none" -> card {
                Tx("Kalender er oppdatert", man(KType.callout, FontWeight.Bold, k.ink))
                Tx(Kal43Upd.currentLabel(ctx) + " er nyeste versjon.", man(KType.callout, FontWeight.Medium, k.mut), maxLines = 2)
            }
            "avail" -> card(k.ink, 1.5.dp) {
                val r = u.rel
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Tx(r?.label ?: "Ny versjon", news(KType.title3, k.ink), Modifier.weight(1f))
                    Tx((r?.file ?: "") + if ((r?.size ?: 0) > 0) " · " + mb(r?.size ?: 0) + " MB" else "", mono(KType.footnote, k.mut))
                }
                if (!r?.notes.isNullOrEmpty()) {
                    Tx("NYTT", mono(KType.caption, Red, .12f))
                    r?.notes?.forEach { n -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { Tx("•", man(KType.callout, FontWeight.Bold, Red)); Tx(n, man(KType.callout, FontWeight.Medium, k.ink), maxLines = 3) } }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    InkPill("Last ned", { scope.launch { u.download(ctx) } }, h = 44.dp)
                    LinePill("Senere", { u.phase = "idle" }, h = 44.dp)
                }
            }
            "dl" -> card {
                val pct = if (u.total > 0) (u.got.toFloat() / u.total).coerceIn(0f, 1f) else 0f
                Row { Tx("Laster ned " + (u.rel?.version ?: ""), man(KType.callout, FontWeight.Bold, k.ink), Modifier.weight(1f)); Tx("${(pct * 100).toInt()} %", mono(KType.subheadline, k.ink)) }
                Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(k.line2)) {
                    Box(Modifier.fillMaxWidth(pct).fillMaxHeight().background(k.ink))
                }
                Tx(mb(u.got) + " av " + (if (u.total > 0) mb(u.total) else "?") + " MB" + (if (u.speed > 0) " · " + mb(u.speed) + " MB/s" else "") + " · signatur sjekkes etterpå", man(KType.subheadline, FontWeight.Medium, k.mut), maxLines = 2)
                LinePill("Avbryt", { u.cancelDownload() }, h = 40.dp)
            }
            "ready" -> card {
                Tx("Klar til å installere", man(KType.callout, FontWeight.Bold, k.ink))
                Tx("Signaturen stemmer med den installerte appen. Android spør om du vil installere oppdateringen.", man(KType.callout, FontWeight.Medium, k.mut), maxLines = 4)
                if (u.needPerm) {
                    Tx("Første gang må du tillate «Installer ukjente apper» for Kalender. Kom tilbake hit etterpå.", man(KType.subheadline, FontWeight.Medium, k.acc), maxLines = 3)
                    LinePill("Åpne innstillingen", { Kal43Upd.openUnknownSources(ctx) }, h = 40.dp)
                }
                InkPill("Installer", { scope.launch { u.install(ctx) } }, h = 44.dp)
            }
            "inst" -> card { Tx("Installerer …", man(KType.callout, FontWeight.Bold, k.ink)) }
            "done" -> Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(k.ds.successSoft).border(1.dp, k.ds.success.copy(alpha = .35f), RoundedCornerShape(18.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Tx("✓ Kalender er oppdatert til ${Kal43Upd.versionName(ctx)} (${Kal43Upd.versionCode(ctx)})", man(KType.callout, FontWeight.Bold, k.ds.success), maxLines = 2)
                Tx("Kalenderne, innstillingene og innloggingen er beholdt.", man(KType.callout, FontWeight.Medium, k.mut), maxLines = 2)
            }
            "err" -> card {
                Tx(u.msg.ifBlank { "Noe gikk galt." }, man(KType.callout, FontWeight.Bold, k.acc), maxLines = 4)
                InkPill("Prøv igjen", { scope.launch { u.check(ctx) } }, h = 44.dp)
                if (u.detail46.isNotBlank()) no.kristo.kalender.ui.UpdDetails46(u.detail46)
            }
            else -> card {
                val last = no.kristo.kalender.Kal43Prefs.lastCheck(ctx)
                val tail = if (no.kristo.kalender.Kal43Prefs.auto(ctx)) "ser etter nye versjoner hver dag" else "automatisk sjekk er av"
                val lt = if (last <= 0) "Ikke sjekket ennå" else java.time.Instant.ofEpochMilli(last).atZone(no.kristo.kalender.OSLO).let { z ->
                    (if (z.toLocalDate() == today()) "Sist sjekket i dag " else "Sist sjekket ${z.dayOfMonth}.${z.monthValue}. ") + "%02d:%02d".format(z.hour, z.minute)
                }
                Tx("$lt · $tail", man(KType.callout, FontWeight.Medium, k.mut), maxLines = 2)
                InkPill("Se etter oppdateringer", { scope.launch { u.check(ctx) } }, h = 44.dp)
            }
        }
        // Innstillinger i samme vindu.
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(k.card).border(1.dp, k.line, RoundedCornerShape(18.dp))) {
            val p = no.kristo.kalender.Kal43Prefs
            // Bryterne leser SharedPreferences; telleren tegner raden på nytt etter et trykk.
            var tick by remember { mutableIntStateOf(0) }
            val seen = tick
            ToggleRow43("Se etter oppdateringer automatisk", "Én gang om dagen fra serveren", p.auto(ctx)) { p.setAuto(ctx, !p.auto(ctx)); Kal43Upd.schedule(ctx); tick++ }
            ToggleRow43("Last ned i bakgrunnen på Wi-Fi", "Du trykker bare Installer når den er klar", p.autoDl(ctx)) { p.setAutoDl(ctx, !p.autoDl(ctx)); Kal43Upd.schedule(ctx); tick++ }
            Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Tx("Kanal", man(KType.callout, FontWeight.Bold, k.ink), Modifier.weight(1f))
                Row(Modifier.clip(RoundedCornerShape(12.dp)).background(k.bg).border(1.dp, k.line, RoundedCornerShape(12.dp)).padding(3.dp)) {
                    listOf("stabil" to "Stabil", "beta" to "Beta").forEach { (id, n) ->
                        val on = p.channel(ctx) == id
                        Box(Modifier.height(36.dp).clip(RoundedCornerShape(9.dp)).background(if (on) k.ink else Color.Transparent).tap(n, Role.RadioButton) {
                            Hap.tick(); p.setChannel(ctx, id); if (u.phase != "dl" && u.phase != "inst") u.phase = "idle"; tick++
                        }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) { Tx(n, man(KType.subheadline, FontWeight.Bold, if (on) k.bg else k.ink)) }
                    }
                }
            }
        }
        Spacer(Modifier.height(24.dp).windowInsetsPadding(WindowInsets.navigationBars))
    }
}

@Composable
private fun ToggleRow43(n: String, sub: String, on: Boolean, onClick: () -> Unit) {
    val k = LocalK.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).tap(n, Role.Switch) { Hap.tick(); onClick() }.drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }.padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Tx(n, man(KType.callout, FontWeight.Bold, k.ink), maxLines = 2)
            Tx(sub, man(KType.footnote, FontWeight.Medium, k.mut), maxLines = 2)
        }
        Toggle(on)
    }
}

/** «Vis detaljer» under feilmeldingen i Programvareoppdatering (URL og feilkode). */
@Composable
fun UpdDetails46(text: String) {
    val k = LocalK.current
    var open by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.height(32.dp).tap(if (open) "Skjul detaljer" else "Vis detaljer") { open = !open }, contentAlignment = Alignment.CenterStart) {
            Tx(if (open) "Skjul detaljer" else "Vis detaljer", man(KType.footnote, FontWeight.Bold, k.mut))
        }
        if (open) Tx(text, mono(KType.caption, k.mut), maxLines = 8)
    }
}

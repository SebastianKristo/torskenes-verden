package no.kristo.kalender.ui

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import no.kristo.kalender.Fag37
import no.kristo.kalender.Geo37
import no.kristo.kalender.Geo37Hit
import no.kristo.kalender.KCal
import no.kristo.kalender.KEv
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red
import no.kristo.kalender.SWC35

/*
 * Prompt 37 (Android): fagfarger, adresse + kart, og tastaturet.
 *  • KalVm.evCal(e): kalenderen med fagfargen (Studie) – brukes overalt der hendelsen vises.
 *  • Kal37Effects: synker fagfargene med profilen og lukker tastaturet når et hendelsesark åpnes (søk, liste, kort, Glimt-kort).
 *  • GlimtMap37: minikart (120 dp, radius 14) med adressen i glass-etikett under Glimt-kortet. Trykk → veibeskrivelse.
 *  • DetailMap37: kart (170 dp, radius 16), full adresse, «Åpne i Kart» (Google Maps) + «Veibeskrivelse ›».
 *  • FagPick37 / FagSettings37: «Farge for MEK1300» i arket og Innstillinger → Studie → Fag.
 */

fun no.kristo.kalender.KalVm.evCal(e: KEv): KCal {
    Fag37.attach(getApplication())
    return Fag37.tint(cal(e.cal), e)
}

@Composable
fun Kal37Effects(vm: no.kristo.kalender.KalVm) {
    val fm = LocalFocusManager.current
    val kb = LocalSoftwareKeyboardController.current
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { Fag37.attach(ctx); Geo37.attach(ctx) }
    LaunchedEffect(vm.session, vm.data) {
        val s = vm.session ?: return@LaunchedEffect
        Fag37.attach(ctx)
        Fag37.sync(s.api)
    }
    // blurKb(): tastaturet lukkes før arket åpnes; søketeksten og treffene beholdes.
    LaunchedEffect(vm.det) {
        if (vm.det != null) { fm.clearFocus(true); kb?.hide() }
    }
}

/** Glimt la til hendelsen (eller den kom fra Glimt i Homelab med koordinater). */
private fun byGlimt(e: KEv) = e.id.startsWith("u") || e.src != null || e.lat != null

@Composable
private fun rememberHit(vm: no.kristo.kalender.KalVm, e: KEv): Geo37Hit? {
    val ctx = LocalContext.current
    Geo37.attach(ctx)
    val (h, need) = Geo37.peek(e)
    LaunchedEffect(e.id, need) { if (need) vm.viewModelScope.launch { Geo37.resolve(ctx.applicationContext, Geo37.place(e)) } }
    return h
}

@Composable
private fun MapImage37(h: Geo37Hit, height: Int, radius: Int) {
    val k = LocalK.current
    var bmp by remember(h.la, h.lo) { mutableStateOf<Bitmap?>(Geo37.mapCached(h.la, h.lo)) }
    LaunchedEffect(h.la, h.lo) { if (bmp == null) bmp = Geo37.map(h.la, h.lo) }
    // Mørkt tema: mørk kartstil (invertert og dempet).
    val dark = ColorMatrix(floatArrayOf(-.82f, 0f, 0f, 0f, 225f, 0f, -.82f, 0f, 0f, 222f, 0f, 0f, -.82f, 0f, 216f, 0f, 0f, 0f, 1f, 0f))
    Box(Modifier.fillMaxWidth().height(height.dp).clip(RoundedCornerShape(radius.dp)).background(k.chip).border(1.dp, k.line2, RoundedCornerShape(radius.dp)), contentAlignment = Alignment.Center) {
        bmp?.let { b ->
            Image(b.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop, colorFilter = if (k.dark) ColorFilter.colorMatrix(dark) else null)
        }
        // Pinnen midt i kartet.
        Box(Modifier.offset(y = (-9).dp).size(18.dp).clip(CircleShape).background(Color.White).padding(3.dp).clip(CircleShape).background(Red))
    }
}

private fun open(ctx: android.content.Context, uri: String) {
    runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}

@Composable
fun GlimtMap37(vm: no.kristo.kalender.KalVm, e: KEv) {
    if (!byGlimt(e)) return
    val h = rememberHit(vm, e) ?: return
    val k = LocalK.current
    val ctx = LocalContext.current
    Box(Modifier.fillMaxWidth().padding(top = 8.dp).tap("Veibeskrivelse til " + h.a) { open(ctx, Geo37.dirUrl(h)) }) {
        MapImage37(h, 120, 14)
        Box(Modifier.align(Alignment.BottomStart).padding(8.dp).clip(RoundedCornerShape(50)).background(k.glass).padding(horizontal = 10.dp, vertical = 5.dp)) {
            Tx(h.a.ifBlank { e.loc.orEmpty() }, man(12.sp, FontWeight.Bold, k.ink))
        }
    }
}

@Composable
fun DetailMap37(vm: no.kristo.kalender.KalVm, e: KEv) {
    val h = rememberHit(vm, e) ?: return
    val k = LocalK.current
    val ctx = LocalContext.current
    val label = h.a.ifBlank { e.loc.orEmpty() }
    Column(
        Modifier.fillMaxWidth().drawBehind { drawLine(k.line2, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }.padding(top = 10.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.tap("Kart") { open(ctx, Geo37.geoUri(h, label)) }) { MapImage37(h, 170, 16) }
        Tx(label, man(12.5.sp, FontWeight.Medium, k.mut), maxLines = 3)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f).height(38.dp).clip(RoundedCornerShape(19.dp)).background(k.chip).tap("Åpne i Kart") { open(ctx, Geo37.geoUri(h, label)) }, contentAlignment = Alignment.Center) {
                Tx("Åpne i Kart", man(13.sp, FontWeight.Bold, k.ink))
            }
            Box(Modifier.weight(1f).height(38.dp).clip(RoundedCornerShape(19.dp)).background(k.ink).tap("Veibeskrivelse") { open(ctx, Geo37.dirUrl(h)) }, contentAlignment = Alignment.Center) {
                Tx("Veibeskrivelse ›", man(13.sp, FontWeight.Bold, k.bg))
            }
        }
    }
}

/* ---------- Fagfarger ---------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FagSwatches37(key: String, done: () -> Unit) {
    val k = LocalK.current
    val cur = Fag37.color(key)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            SWC35.forEach { col ->
                val on = (col and 0xFFFFFF) == (cur and 0xFFFFFF)
                Box(Modifier.size(36.dp).tap("Farge") { no.kristo.kalender.Hap.tick(); Fag37.set(key, col); done() }, contentAlignment = Alignment.Center) {
                    Box(
                        Modifier.size(32.dp).clip(CircleShape).background(if (on) Color(col) else Color.Transparent).padding(2.dp).clip(CircleShape)
                            .background(if (on) k.card else Color.Transparent).padding(2.dp).clip(CircleShape).background(Color(col)),
                    )
                }
            }
        }
        if (Fag37.ownOf(key) != null) LinePill("Standard fagfarge", { Fag37.set(key, null); done() }, h = 30.dp)
    }
}

/** «Farge for MEK1300» i hendelsesarket (bare Studie-hendelser med fag). */
@Composable
fun FagPick37(vm: no.kristo.kalender.KalVm, e: KEv) {
    val key = Fag37.key(e.t)
    if (key.isEmpty() || !Fag37.isStudy(e, vm.cal(e.cal))) return
    val k = LocalK.current
    var open by remember(e.id) { mutableStateOf(false) }
    @Suppress("UNUSED_VARIABLE") val r = Fag37.rev
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).tap("Farge for " + Fag37.label(key)) { open = !open }, verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(12.dp).clip(CircleShape).background(Color(Fag37.color(key))))
            Spacer(Modifier.width(8.dp))
            Tx("Farge for " + Fag37.label(key), man(14.sp, FontWeight.Bold, k.ink), Modifier.weight(1f))
            Tx(if (open) "Lukk" else "Endre", man(13.sp, FontWeight.Bold, k.mut))
        }
        if (open) FagSwatches37(key) { open = false }
    }
}

/** Innstillinger → Studie → Fag: alle fag med fargeprikk. Trykk gir fargevelger. */
@Composable
fun FagSettings37(vm: no.kristo.kalender.KalVm) {
    val k = LocalK.current
    @Suppress("UNUSED_VARIABLE") val r = Fag37.rev
    Fag37.attach(LocalContext.current)
    val rows = Fag37.rows(vm.all) { vm.cal(it) }
    var picking by remember { mutableStateOf("") }
    Column(Modifier.drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }) {
        if (rows.isEmpty()) Tx("Ingen fag i Studie-kalenderen ennå.", man(13.sp, FontWeight.Medium, k.mut), Modifier.padding(vertical = 12.dp))
        rows.forEach { row ->
            Column(Modifier.fillMaxWidth().drawBehind { drawLine(k.line2, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }) {
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).tap("Farge for " + row.label) { picking = if (picking == row.key) "" else row.key }, verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.width(26.dp), contentAlignment = Alignment.Center) { Box(Modifier.size(14.dp).clip(CircleShape).background(Color(row.c))) }
                    Spacer(Modifier.width(12.dp))
                    Tx(row.label, man(14.5.sp, FontWeight.Bold, k.ink), Modifier.weight(1f))
                    Tx(if (row.own) "Eget valg" else "Fast", man(12.sp, FontWeight.Medium, k.mut))
                }
                if (picking == row.key) Box(Modifier.padding(start = 38.dp, bottom = 10.dp)) { FagSwatches37(row.key) { picking = "" } }
            }
        }
    }
}

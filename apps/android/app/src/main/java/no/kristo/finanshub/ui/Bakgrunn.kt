package no.kristo.finanshub.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import no.kristo.finanshub.*

/* ======================= Bakgrunn: kreditering i Tilpass ======================= */

/** «Foto: {forfatter} · {lisens} · Wikimedia Commons» med lenke til filsiden, under valgt bilde. Aldri på Hjem. */
@Composable
internal fun BgCredit41(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val line = vm.photoCredit ?: return
    val file = if (vm.photoKind == "oslo") vm.p41.osloFile else null
    Text(
        line + if (file != null) " ↗" else "", color = p.mut, fontSize = 11.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
        modifier = Modifier.padding(horizontal = 6.dp).then(if (file != null) Modifier.clickable { openLink(ctx, commonsPage41(file)) } else Modifier),
    )
    if (vm.photoKind == "oslo") Text("Oslo fra lufta · skifter gjennom dagen", color = p.mut, fontSize = 11.5.sp, modifier = Modifier.padding(horizontal = 6.dp))
}

/* ======================= Bakgrunn: Google Photos-album ======================= */

/** Raden under «Eget bilde» i bakgrunnsmenyen. */
@Composable
internal fun GphotoRow46(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(Unit) { if (vm.p46.gp == null) vm.loadGphoto46() }
    val g = vm.p46.gp
    val on = vm.photoKind == "gphoto"
    Row(
        Modifier.fillMaxWidth().heightIn(min = 50.dp).clip(RoundedCornerShape(12.dp)).background(if (on) p.popSel else Color.Transparent)
            .clickable { if (on && g?.error != null) vm.retryGphoto46() else { vm.photoMenu = false; vm.p46.gpErr = null; vm.p46.gpSheet = true } }.padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(30.dp).clip(RoundedCornerShape(8.dp)).background(Color.White).border(1.dp, p.line, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
            vm.photoThumbs["gphoto"]?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize().clip(RoundedCornerShape(8.dp))) }
                ?: Text("✿", color = Color(0xFF4F8FD6), fontSize = 15.sp)
        }
        Column(Modifier.weight(1f)) {
            Text("Google Photos-album", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
            Text(when {
                g?.error != null && on -> "Fikk ikke hentet albumet · trykk for å prøve igjen"
                g?.configured == true -> g.rowText ?: "Bytter bilde hver time"
                else -> "Delt album som bakgrunn"
            }, color = if (g?.error != null && on) p.lab else p.mut, fontSize = 11.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (on) Text("✓", color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}

/** Felt for lenken + «Bruk album» / «Fjern». */
@Composable
internal fun GphotoSheet46(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p46
    var url by remember { mutableStateOf(s.gp?.url ?: "") }
    Dialog(onDismissRequest = { s.gpSheet = false }) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(p.bg).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PSerif("Google Photos-album", 22.sp)
            Text("Lim inn lenken til et delt album. Bakgrunnen bytter bilde hver time, likt på alle enhetene dine.", color = p.mut, fontSize = 13.sp)
            PField("Lenke", url, { url = it; s.gpErr = null }, placeholder = "https://photos.app.goo.gl/…", keyboard = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done))
            s.gpErr?.let { Text(it, color = p.lab, fontSize = 12.5.sp) }
            if (s.gpBusy) Text("Henter bilder fra albumet …", color = p.mut, fontSize = 13.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (s.gp?.configured == true) PButton("Fjern", Modifier.weight(1f), kind = "line", height = 44.dp) { vm.removeGphoto46() }
                PButton(if (s.gpBusy) "Henter …" else "Bruk album", Modifier.weight(1f), height = 44.dp) { if (!s.gpBusy) vm.useGphoto46(url) }
            }
        }
    }
}

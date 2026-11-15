@file:JvmName("DomeneSporing")

package no.kristo.finanshub.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Sporing: kode som lå i blandingsfilene (Ui21.kt, Ui37.kt, Ui42.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/* ---------------- Pakkekort med logo ---------------- */

/**
 * Felles pakkelogo (52×52, radius 14, hvit flate, 1 dp kant): butikkens logo først, så fraktselskapets, så bokstav i
 * selskapets farge. Når butikken vises, står fraktselskapet som liten rund merkelapp (18×18, hvit kant) nede til høyre.
 */
@Composable
internal fun PackageLogo(vm: AppViewModel, s: Shipment, size: Int = 52) {
    val p = PaperPal.current
    val shape = RoundedCornerShape((size * 14f / 52f).dp)
    var shopBmp by remember(s.id, s.shopDomain, s.logoId) { mutableStateOf<android.graphics.Bitmap?>(null) }
    var carrierBmp by remember(s.id, s.carrier) { mutableStateOf<android.graphics.Bitmap?>(null) }
    // Prompt 42: fraktselskapet normaliseres (carrier_id) før oppslag; PostNord er pakket med appen og slås ikke opp på nett.
    val cid = no.kristo.finanshub.carrierId42(s.carrier)?.takeIf { it != "other" } ?: no.kristo.finanshub.carrierId42(s.carrierName)
    val bundled = cid == "postnord"
    LaunchedEffect(s.id, s.shopDomain, s.logoId, s.carrier) {
        if (s.hasShopLogo) shopBmp = runCatching { vm.logoFor(s.shopDomain, s.shop.ifBlank { s.logoId }) }.getOrNull()
        // Prompt 22: fraktselskapet bare fra manuelt kontrollerte filer i logobiblioteket, aldri et tilfeldig favicon.
        if (!bundled) carrierBmp = runCatching { vm.carrierRegLogo(s.carrierDomain ?: CARRIER_DOMAINS[cid ?: s.carrier] ?: CARRIER_DOMAINS[s.carrier], s.carrierName) }.getOrNull()
        if (!bundled && carrierBmp == null && carrierMarkId(cid, s.carrierIni) == null) android.util.Log.d("logo", "logo_miss carrier=\"${s.carrierName}\" normalized=\"$cid\" source=app")
    }
    val main = shopBmp
    Box(Modifier.size((size + 4).dp)) {
        Box(Modifier.size(size.dp).clip(shape).background(Color.White).border(1.dp, p.line, shape), contentAlignment = Alignment.Center) {
            val img = main ?: carrierBmp
            if (img == null && bundled) PostNordLogo42(size, white = false)
            else if (img != null) androidx.compose.foundation.Image(img.asImageBitmap(), null, contentScale = androidx.compose.ui.layout.ContentScale.Fit,
                modifier = Modifier.fillMaxSize().padding((size * .14f).dp))
            else CarrierBadge(s.carrierIni, s.carrierColor, s.carrierFg, size, s.carrier)
        }
        // Liten fraktmerkelapp når butikkens logo vises.
        if (main != null) Box(
            Modifier.align(Alignment.BottomEnd).size(18.dp).clip(CircleShape).background(Color.White).border(1.5.dp, Color.White, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            val cb = carrierBmp
            if (bundled) PostNordLogo42(18, white = false)
            else if (cb != null) androidx.compose.foundation.Image(cb.asImageBitmap(), null, contentScale = androidx.compose.ui.layout.ContentScale.Fit, modifier = Modifier.fillMaxSize().padding(2.dp).clip(CircleShape))
            else Box(Modifier.fillMaxSize().clip(CircleShape).background(Color(s.carrierColor)), contentAlignment = Alignment.Center) {
                Text(s.carrierIni.take(1), color = Color(s.carrierFg), fontSize = 9.sp, fontWeight = FontWeight.Black)
            }
        }
    }
}

/** «+12 pakker ›» (antall minus denne), «›» når det bare er én. */
internal fun morePackagesLabel(vm: AppViewModel, first: Shipment?): String {
    val more = first?.moreCount
        ?: vm.mobileHome?.packagesTotal?.let { it - 1 }
        ?: vm.tracking?.items?.count { it.active }?.let { it - 1 }
        ?: ((vm.homePackages?.size ?: 1) - 1)
    return when { more <= 0 -> "›"; more == 1 -> "+1 pakke ›"; else -> "+$more pakker ›" }
}

/* ======================= Pakker (h2) ======================= */

/**
 * Pakker-widgeten: én pakke (som før, [single]) eller 2–3 rader. Med «vis bare når det er pakker» og 0 aktive pakker vises den
 * bare i wiggle-modus, dempet (gråtone, 65 %) med merket «Skjult når ingen pakker». Kommer den tilbake, glir den mykt inn.
 */
@Composable
internal fun Packages37(vm: AppViewModel, wide: Boolean, single: @Composable () -> Unit) {
    val p = PaperPal.current
    val s = vm.p37
    val hidden = vm.h2Hidden37()
    val edit = vm.editPage == "hjem"
    LaunchedEffect(hidden) { if (hidden) s.h2WasHidden = true }
    val vis = remember { MutableTransitionState(!s.h2WasHidden) }
    LaunchedEffect(Unit) { vis.targetState = true }
    AnimatedVisibility(vis, enter = fadeIn(tween(320)) + expandVertically(tween(320))) {
        Box(Modifier.fillMaxWidth()) {
            Box(Modifier.fillMaxWidth().gray37(edit && hidden).graphicsLayer { alpha = if (edit && hidden) .65f else 1f }) {
                val list = (vm.tracking?.top(3) ?: vm.homePackages ?: emptyList())
                if (s.h2N <= 1 || list.size <= 1) single()
                else PCard(onClick = { vm.paperTab("trk") }) {
                    Column(Modifier.padding(14.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        PLabel("Pakker · ${vm.packagesOnWay}")
                        list.take(s.h2N).forEach { pk ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                PackageLogo(vm, pk, 38)
                                Column(Modifier.weight(1f)) {
                                    Text(pk.cardTitle, color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(listOf(if (pk.ready) "Hent i dag" else pk.statusText.ifBlank { "På vei" }, pk.etaText, pk.carrierName).filter { it.isNotBlank() }.joinToString(" · "),
                                        color = if (pk.ready) p.lab else p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                }
            }
            if (edit && hidden) Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp).shadow(4.dp, RoundedCornerShape(9.dp)).clip(RoundedCornerShape(9.dp)).background(p.card).padding(9.dp, 3.dp)) {
                Text("Skjult når ingen pakker", color = p.mut, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
            }
        }
    }
}

/** «Rediger widget» på Pakker: Vis bare når det er pakker (på), status, Pakker som vises 1/2/3, Ferdig. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun H2Sheet37(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p37
    val n = vm.activePackages37() ?: 0
    val close = { s.h2Menu = false }
    ModalBottomSheet(onDismissRequest = close, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) }) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, bottom = 26.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PSerif("Pakker", 24.sp, modifier = Modifier.weight(1f), maxLines = 1)
                SheetButton30("Ferdig", onClick = close)
            }
            PCard {
                PToggle("Vis bare når det er pakker", when {
                    !s.h2Auto -> "Vises alltid"
                    n == 1 -> "1 pakke på vei nå"
                    n > 1 -> "$n pakker på vei nå"
                    else -> "Ingen pakker nå · widgeten er skjult"
                }, s.h2Auto) { vm.setH2Opt37(auto = it) }
            }
            PLabel("PAKKER SOM VISES", p.mut)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                (1..3).forEach { k -> PChip("$k", s.h2N == k) { vm.setH2Opt37(n = k) } }
            }
            Text("Andre ser aldri pakkene dine. Widgeten viser bare egne pakker.", color = p.mut, fontSize = 12.5.sp)
        }
    }
}

/* ======================= Sporing: husstandens nøkler ======================= */

/** Innstillinger → Integrasjoner → SPORING · DELT I HUSSTANDEN: én rad per leverandør, maskert nøkkel, Endre/Fjern for admin. */
@Composable
internal fun TrkKeys37Section(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p37
    LaunchedEffect(vm.account?.id) { vm.loadTrkKeys37() }
    val k = s.trk ?: return
    if (s.trkMissing || k.providers.isEmpty()) return
    Column(Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.padding(horizontal = 4.dp, vertical = 2.dp), verticalAlignment = Alignment.Bottom) {
            Text("SPORING · DELT I HUSSTANDEN", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.26.sp, modifier = Modifier.weight(1f))
            if (!k.admin) Text("Administreres av admin", color = p.mut, fontSize = 12.sp)
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)) {
            k.providers.forEachIndexed { i, pr ->
                if (i > 0) Box(Modifier.fillMaxWidth().padding(start = 14.dp).height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().heightIn(min = 58.dp).clickable(enabled = k.admin) { s.trkEdit = pr.id }.padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    val dot = when { !pr.set -> p.line; pr.status == "ok" -> p.pos; pr.status == "quota" -> Color(0xFFC88A1E); else -> p.lab }
                    Box(Modifier.size(9.dp).clip(CircleShape).background(dot))
                    Column(Modifier.weight(1f)) {
                        Text(pr.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1)
                        Text(if (!pr.set) "Ikke satt opp" else "Delt i husstanden" + (pr.addedBy?.let { " · lagt inn av $it" } ?: ""), color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (pr.set) Text("••••" + (pr.tail ?: ""), color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp)
                    if (k.admin) Text("Endre ›", color = p.mut, fontSize = 13.sp)
                }
            }
        }
        val q = k.quotaText?.let { "$it." } ?: if (k.limit != null && k.mine != null) "Du har brukt ${k.mine} av husstandens ${k.limit} oppslag denne måneden" + (k.perUserPct?.let { " · maks $it % per bruker" } ?: "") + "." else null
        Text(listOfNotNull("Nøklene deles i husstanden, så alle kan spore uten egne nøkler. Sporingsnumre og pakker er alltid private.", q).joinToString(" "),
            color = p.mut, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
    s.trkEdit?.let { id -> k.providers.firstOrNull { it.id == id }?.let { TrkKeySheet37(vm, it) } }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TrkKeySheet37(vm: AppViewModel, pr: TrkKey37) {
    val p = PaperPal.current
    var key by remember(pr.id) { mutableStateOf("") }
    var sure by remember(pr.id) { mutableStateOf(false) }
    val close = { vm.p37.trkEdit = null }
    ModalBottomSheet(onDismissRequest = close, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(18.dp, 0.dp, 18.dp, 26.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PSerif(pr.name, 24.sp, modifier = Modifier.weight(1f), maxLines = 1)
                SheetButton30("Lukk", "secondary", onClick = close)
            }
            Text(if (pr.set) "Nåværende nøkkel: ••••${pr.tail ?: ""}. Den vises aldri i klartekst." else "Legg inn nøkkelen én gang, så kan alle i husstanden spore.", color = p.mut, fontSize = 13.sp)
            PField("Ny API-nøkkel", key, { key = it.trim() }, placeholder = "Lim inn nøkkelen", password = true, keyboard = KeyboardOptions.Default)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (pr.set) PButton(if (sure) "Trykk igjen for å fjerne" else "Fjern", Modifier.weight(1f), kind = "line") { if (sure) vm.putTrkKey37(pr.id, null) else sure = true }
                PButton(if (vm.p37.trkBusy) "Lagrer …" else "Lagre", Modifier.weight(1f)) { if (key.isNotBlank() && !vm.p37.trkBusy) vm.putTrkKey37(pr.id, key) }
            }
        }
    }
}

/** Sporing-siden: «Bruker husstandens ParcelsApp-nøkkel · 17 oppslag igjen». */
@Composable
internal fun TrkLine37(vm: AppViewModel) {
    LaunchedEffect(vm.account?.id) { if (vm.p37.trk == null) vm.loadTrkKeys37() }
    val t = vm.trkLine37() ?: return
    Text(t, color = PaperPal.current.mut, fontFamily = PaperFonts.sans, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(8.dp, 6.dp))
}

/* ======================= PostNord-logoen (pakket med appen) ======================= */

/** PostNord-merket på hvit flis (radius 14 per 52), 12 % luft, fyller bredden. Ingen nettoppslag (virker i flymodus). */
@Composable
internal fun PostNordLogo42(size: Int, white: Boolean = true) {
    val shape = RoundedCornerShape((size * 14f / 52f).dp)
    Box(Modifier.size(size.dp).clip(shape).background(if (white) Color.White else Color.Transparent), contentAlignment = Alignment.Center) {
        Image(painterResource(no.kristo.finanshub.R.drawable.carrier_postnord), "PostNord", contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize().padding((size * .12f).dp))
    }
}

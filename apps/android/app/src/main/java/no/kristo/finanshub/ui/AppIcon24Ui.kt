package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 24 (A): Innstillinger → Navn på appen og App-ikon (Mobil Papir App.dc.html → HOMELAB).
 * Navn: tekstfelt (maks 20 tegn), forhåndsvisning slik det ser ut på hjemskjermen, ferdige navn, Lagre og Tilbakestill.
 * Ikon: ikonene med kant på valgt, og beskjed om at launcheren kan bruke noen sekunder.
 */

/** Ikon og navn slik de står på hjemskjermen (over et lite bakgrunnsutsnitt). */
@Composable
private fun HomePreview24(icon: String, label: String) {
    Box(
        Modifier.fillMaxWidth().height(132.dp).clip(RoundedCornerShape(20.dp)).background(Brush.linearGradient(listOf(Color(0xFF6D7F8F), Color(0xFF2E3A46)))),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            AppIconPreview(icon, label, Modifier.size(60.dp))
            Text(label, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun AppNameSheet24(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    var name by remember { mutableStateOf(vm.appName) }
    val v = name.trim().ifBlank { "Homelab" }
    val preset = v in APP_LABELS
    ModalBottomSheet(onDismissRequest = { vm.appNameEdit = false }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().imePadding().padding(18.dp, 0.dp, 18.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PSerif("Navn på appen", 24.sp)
            Text("Vises øverst på Hjem, i widgets og i varsler.", color = p.mut, fontSize = 13.sp)
            // Under ikonet står et ferdig navn (eller standardnavnet), siden Android ikke kan endre etiketten fritt.
            HomePreview24(vm.appInfo.icon, if (preset) v else (vm.launcherLabel ?: "FinansHub"))
            PField("Navn (maks 20 tegn)", name, { name = it.take(20) }, placeholder = "Homelab", onDone = { vm.saveAppName(name); vm.appNameEdit = false })
            Text("${name.length} / 20", color = p.mut, fontSize = 11.5.sp, fontFamily = PaperFonts.mono)
            PLabel("Ferdige navn (også under ikonet)")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                APP_LABELS.forEach { s -> PChip(s, v == s) { name = s } }
            }
            if (!preset) Text("Navnet under ikonet på hjemskjermen kan bare være et av de ferdige navnene på Android. Det frie navnet brukes inne i appen.",
                color = p.lab, fontSize = 12.5.sp)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("Tilbakestill", Modifier.weight(1f), kind = "line", height = 50.dp) { name = "Homelab" }
                PButton("Lagre", Modifier.weight(1f), height = 50.dp) { vm.saveAppName(name); vm.appNameEdit = false }
            }
            if (!preset) Text("Legg til snarvei med eget navn ›", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable {
                    if (!pinNamedShortcut24(ctx, v, vm.appInfo.icon)) vm.flash("Hjemskjermen støtter ikke festede snarveier")
                }.padding(vertical = 6.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AppIconSheet24(vm: AppViewModel) {
    val p = PaperPal.current
    ModalBottomSheet(onDismissRequest = { vm.appIconEdit = false }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().padding(18.dp, 0.dp, 18.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PSerif("App-ikon", 24.sp)
            Text("Alle ikonene har eget monokromt lag, så «Tematiske ikoner» (Tonet) farger dem som resten av hjemskjermen.", color = p.mut, fontSize = 13.sp)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                APP_ICONS.forEach { (k, name, _) ->
                    val on = vm.appInfo.icon == k
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).border(if (on) 2.dp else 1.dp, if (on) p.ink else p.line, RoundedCornerShape(18.dp))
                            .clickable { if (!on) vm.setAppIcon(k) }.padding(10.dp),
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        AppIconPreview(k, vm.appName, Modifier.size(64.dp))
                        Text(name, color = p.ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, textAlign = TextAlign.Center)
                        if (on) Text("✓ I bruk", color = p.pos, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            Text("Ikonet byttes i appskuffen og på hjemskjermen. Det kan ta noen sekunder (Samsung opptil 10). Snarveier på hjemskjermen kan bli fjernet, og må legges til på nytt.",
                color = p.mut, fontSize = 12.5.sp)
        }
    }
}

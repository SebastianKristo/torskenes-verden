package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/* ---------------- AI-feil: Prøv igjen / Åpne AI-kontroll ---------------- */

@Composable
internal fun AiErrActions34(vm: AppViewModel, fg: Color, bg: Color, retry: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.height(32.dp).clip(CircleShape).background(bg).press24 { Haptics.tap(); retry() }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text("Prøv igjen", color = fg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
        }
        Box(Modifier.height(32.dp).clip(CircleShape).background(bg).press24 { vm.openAiCtl34("ov") }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text("Åpne AI-kontroll ›", color = fg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
        }
    }
}

/** Rad i Innstillinger → App: «AI og modeller» åpner AI-kontroll i fullskjerm. */
@Composable
internal fun AiSettingsRow34(vm: AppViewModel, i: Int) {
    Box(Modifier.hl34(vm, "ai-mod", 0.dp)) {
        SetRow(vm, i, Icons.Filled.Memory, "AI og modeller", "Glimt · modeller, jobber, forbruk og nøkler") { vm.openAiCtl34("ov") }
    }
}

/** Glimt-søket i Innstillinger: knappen «Vis meg nå ›» og automatisk navigering etter 1,6 s når svaret har et mål. */
@Composable
internal fun ShowMeNow34(vm: AppViewModel, target: String, label: String = "Vis meg nå ›") {
    val p = PaperPal.current
    LaunchedEffect(target, vm.b24.aiAnswer) {
        delay(1600)
        if (vm.b24.sq.isNotBlank() && vm.b24.aiAnswer != null) vm.goAnchor34(target)
    }
    Box(
        Modifier.height(36.dp).clip(CircleShape).background(p.ink).press24 { Haptics.select(); vm.goAnchor34(target) }.padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
}

/* ======================= AI-kontroll ======================= */

private fun gb38(v: Double, dec: Int = 1): String = String.format(java.util.Locale("nb", "NO"), "%.${dec}f", v).replace(",0", "").let { if (dec == 0) it else it }

/** «Mac mini M4 · 16 GB samlet minne · 2 TB ekstern disk» med minne til modeller (GPU) og ekstern disk. */
@Composable
internal fun AiHw38(vm: AppViewModel, T: AcT34): Boolean {
    val h = vm.p38.hw ?: return false
    AcHead34(T, "AI-MASKIN")
    AcCard34(T) {
        val disk = h.diskTotalGb?.let { t -> (if (t >= 1000) gb38(t / 1000, 1) + " TB" else gb38(t, 0) + " GB") + if (h.external) " ekstern disk" else " disk" }
        Text(h.label ?: listOfNotNull(h.model, h.memGb?.let { gb38(it, 0) + " GB samlet minne" }, disk).joinToString(" · "), color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
        h.chip?.takeIf { it.isNotBlank() && it !in h.model }?.let { Text(it, color = T.mut, fontSize = 12.sp) }
        val b = h.gpuBudgetGb
        if (b != null && b > 0) {
            val u = h.gpuUsedGb ?: 0.0
            Row { Text("Minne til modeller (GPU)", color = T.mut, fontSize = 12.5.sp, modifier = Modifier.weight(1f)); Text("${gb38(u)} / ${gb38(b)} GB", color = T.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp) }
            AcBar34(T, (u / b).toFloat().coerceIn(0f, 1f), if (u > b - 1.2) T.warn else T.ok)
        }
        val t = h.diskTotalGb
        if (t != null && t > 0) {
            val used = h.diskUsedGb ?: (t - (h.diskFreeGb ?: t)).coerceAtLeast(0.0)
            Row { Text(if (h.external) "Modeller på ekstern disk" else "Modeller på disk", color = T.mut, fontSize = 12.5.sp, modifier = Modifier.weight(1f)); Text("${gb38(used, 0)} / ${gb38(t, 0)} GB", color = T.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp) }
            AcBar34(T, (used / t).toFloat().coerceIn(0f, 1f), T.ink)
        }
        (h.warnings.ifEmpty { if (h.mounted == false) listOf("Ekstern disk mangler · Ollama finner ikke modellene") else emptyList() }).forEach { w ->
            Text(w, color = T.bad, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
        }
        Text("Første svar etter at en modell er lastet ut kan ta opptil 60 s (lastes fra disk).", color = T.mut, fontSize = 12.sp, lineHeight = 16.sp)
    }
    val rec = vm.p38.recommend
    if (rec.isNotEmpty()) {
        AcHead34(T, "ANBEFALT FOR DENNE MASKINEN")
        AcCard34(T) {
            rec.forEachIndexed { i, r ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(T.line))
                Text(r.text, color = T.ink, fontSize = 13.sp, lineHeight = 18.sp)
                r.env?.let { Text(it, color = T.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp) }
            }
        }
    }
    return true
}

/** «HVILKEN MODELL GJØR HVA I FINANS»: alltid 4 rader (Modell + Reserve), rød advarsel ved sky + finansdata lokalt, tom tilstand. */
@Composable
internal fun AiFinRouting38(vm: AppViewModel, T: AcT34) {
    val s = vm.p38
    LaunchedEffect(vm.account?.id) { vm.loadFinRouting38() }
    val rows = s.finRt ?: FIN_RT38
    val finLocal = vm.p34.aiRules["finLocal"] == true
    AcHead34(T, "HVILKEN MODELL GJØR HVA I FINANS")
    val anyOpts = rows.any { vm.finOptions38(it).isNotEmpty() }
    AcCard34(T) {
        if (s.finEmpty || (!anyOpts && vm.p34.aiModels != null)) {
            Text("Ingen modeller ennå", color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
            Text("Installer en lokal modell eller koble til en sky-modell, så kan du velge hvem som gjør hva i Finans.", color = T.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
            AcPill34(T, "Installer modell ›", solid = true) { vm.setAiTab34("mod") }
            return@AcCard34
        }
        rows.forEachIndexed { i, r ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(T.line))
            val opts = vm.finOptions38(r)
            val list = opts.map { it.id to (it.label + if (it.local) " · LOKAL" else " · SKY") }
            Text(r.name, color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
            if (r.sub.isNotBlank()) Text(r.sub, color = T.mut, fontSize = 12.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AcDrop34(T, "Modell", r.model, list, Modifier.weight(1f)) { vm.setFinRoute38(r.key, it, null) }
                AcDrop34(T, "Reserve", r.fallback, listOf("" to "Ingen") + list, Modifier.weight(1f)) { vm.setFinRoute38(r.key, null, it) }
            }
            val cloud = opts.firstOrNull { it.id == r.model }?.local == false
            when {
                r.warning != null -> Text(r.warning, color = if (finLocal && cloud) T.bad else T.warn, fontSize = 12.sp, lineHeight = 17.sp)
                finLocal && cloud -> Text("«Finansdata forlater aldri huset» er på, men modellen er i skyen. Velg en lokal modell. Reserve i skyen brukes ikke.",
                    color = T.bad, fontSize = 12.sp, lineHeight = 17.sp)
            }
        }
    }
}

/* ======================= AI-jobber: klokkeslett ======================= */

@Composable
internal fun JobTime41(j: AiJob34, ink: Color, mut: Color) {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(j.id) { while (true) { delay(60_000); now = System.currentTimeMillis() } }
    val t = jobTime41(j, now) ?: return
    Column(horizontalAlignment = Alignment.End) {
        Text(t.first, color = ink, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, maxLines = 1)
        t.second?.let { Text(it, color = mut, fontFamily = PaperFonts.mono, fontSize = 10.5.sp, maxLines = 1) }
    }
}

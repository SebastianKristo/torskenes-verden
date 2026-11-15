package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import no.kristo.finanshub.ApiException
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.GlimtErr50
import no.kristo.finanshub.GlimtErrKind50
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.Receipt
import no.kristo.finanshub.Reread40
import no.kristo.finanshub.glimtErr50
import no.kristo.finanshub.glimtJobErr50
import no.kristo.finanshub.parseReanalysis
import no.kristo.finanshub.reread40
import org.json.JSONObject

/*
 * Prompt 50 (ANDROID50B):
 *  - claude-code-finans-kvittering-fargefeil.md: «Lav sikkerhet»-boksen på Bekreft kvittering bruker temafargene – flate surf2
 *    (sand i lyst, mørk i mørkt tema), kant 1 dp line, tekst sub (ink-2, ≥ 4,5:1), ingen hardkodede blåtoner eller opasitet på tekst.
 *    «✦ Analyser på nytt med Gemini» er en primærknapp (#4f63ff, hvit, 600) og bare grå når den faktisk er deaktivert (med grunnen under);
 *    «Les med lokal OCR» er sekundær (kort + kant + ink). Tekst øverst, knappene på én rad under (FlowRow, 10 dp), Gemini først.
 *  - claude-code-kvittering-les-pa-nytt-502.md: «Les på nytt» går som jobb (async, polling hvert 1,5 s), fremdrift «Leser … 12 s»,
 *    tydelige meldinger (GlimtErr50.kt) og «Les mindre versjon» ved tidsavbrudd. Arket beholder «Lukk» og «Prøv igjen».
 */

/** Aksenten fra spesifikasjonen (--b-acc, som «Prøv igjen» på web). Hvit tekst gir 4,9:1. */
private val ACC50 = Color(0xFF4F63FF)

/** Tilstand for «Analyser på nytt» på bekreftelsessiden (én kvittering om gangen, som vm.reanalyzing). */
private object ReState50 {
    var err by mutableStateOf<Pair<String, GlimtErr50>?>(null)
    var started by mutableLongStateOf(0L)
    var engine by mutableStateOf("ollama") // prompt 52: Gemini er fjernet fra kvitteringslesingen
}

/** «Leser … 12 s» mens en lesing pågår. */
@Composable
internal fun ReadSecs50(started: Long, small: Boolean = false) {
    if (started <= 0L) return
    val p = PaperPal.current
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(started) { while (true) { now = System.currentTimeMillis(); delay(1000) } }
    val s = ((now - started) / 1000).coerceAtLeast(0)
    Text("Leser${if (small) " mindre versjon" else ""} … $s s", color = p.mut, fontSize = 12.5.sp, fontFamily = PaperFonts.mono)
}

@Composable
private fun Btn50(text: String, primary: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    val p = PaperPal.current
    val shape = RoundedCornerShape(20.dp)
    val bg = when { !enabled -> p.surf2; primary -> ACC50; else -> p.card }
    val fg = when { !enabled -> p.mut; primary -> Color.White; else -> p.ink }
    Box(
        Modifier.height(40.dp).clip(shape).background(bg).then(if (!primary || !enabled) Modifier.border(1.dp, p.line, shape) else Modifier)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick).padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = fg, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1) }
}

/** Feilknappene i «✦ Glimt leser kvitteringen på nytt»: Prøv igjen · Les mindre versjon (ved tidsavbrudd) · Lukk. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun RereadErr50Buttons(vm: AppViewModel, txId: Int, receiptId: String, r: Reread40) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (r.kind50 != GlimtErrKind50.MISSING) Btn50("Prøv igjen", true) { vm.p40.rr = vm.p40.rr - txId; vm.reread40(txId, receiptId, small = r.small50) }
        if (r.kind50 == GlimtErrKind50.SLOW && !r.small50) Btn50("Les mindre versjon", false) { vm.p40.rr = vm.p40.rr - txId; vm.reread40(txId, receiptId, small = true) }
        Btn50("Lukk", false) { vm.p40.rr = vm.p40.rr - txId }
    }
}

/**
 * «✦ Analyser på nytt» som jobb: POST /finans/api/receipts/:id/reanalyze {engine, async:true[, small:true]} → {jobId} → GET /jobs/:id
 * hvert 1,5 s → {previous, result, candidateId}. Sammenligningen (vm.reanalysis) vises som før; ingenting lagres før brukeren velger.
 */
internal fun AppViewModel.reanalyze50(id: String, engine: String = "ollama", small: Boolean = false) {
    if (reanalyzing != null) return
    reanalyzing = id
    ReState50.err = null; ReState50.started = System.currentTimeMillis(); ReState50.engine = engine
    Haptics.tap()
    launch40 {
        fun fail(e: GlimtErr50) { ReState50.err = id to e; Haptics.error() }
        try {
            val body = JSONObject().put("engine", engine).put("async", true)
            if (small) body.put("small", true).put("maxSide", 1280)
            val first = JSONObject(api40 { request("POST", "/receipts/$id/reanalyze", body, read = 60_000) })
            var res: JSONObject? = if (first.has("candidateId")) first else null
            val job = first.optString("jobId").ifBlank { null }
            var n = 0
            while (res == null && job != null && n++ < 240) {
                delay(1500)
                val j = runCatching { JSONObject(api40 { get("/jobs/$job") }) }.getOrNull() ?: continue
                when (j.optString("status")) {
                    "done" -> res = j.optJSONObject("result") ?: JSONObject()
                    "error", "cancelled" -> { fail(glimtJobErr50(j)); return@launch40 }
                }
            }
            val r = res ?: run { fail(glimtErr50(504, "tidsavbrudd", "jobben ble ikke ferdig", "reanalyze50")); return@launch40 }
            if (r.optString("candidateId").isBlank()) { fail(GlimtErr50("Glimt fant ikke noe nytt å foreslå.", GlimtErrKind50.OTHER)); return@launch40 }
            reanalysis = parseReanalysis(id, r.toString())
            Haptics.success()
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            fail(glimtErr50(e, "reanalyze50"))
        } catch (e: Exception) {
            fail(GlimtErr50(e.message ?: "Noe gikk galt.", GlimtErrKind50.OTHER))
        } finally { reanalyzing = null; ReState50.started = 0L }
    }
}

/** «Lav sikkerhet»-boksen på Bekreft kvittering (tekst øverst, lokal AI først, så lokal OCR). Prompt 52: ingen Gemini. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun LowConfBox50(vm: AppViewModel, r: Receipt) {
    val p = PaperPal.current
    val busy = vm.reanalyzing == r.id
    val err = ReState50.err?.takeIf { it.first == r.id }?.second
    val pct = (if (r.confidence <= 1) r.confidence * 100 else r.confidence).toInt()
    val localOff = !r.canReanalyze && r.reanalyzeReason != null && !r.reanalyzeReason.contains("Gemini", ignoreCase = true)
    val info = when {
        r.status == "error" || r.error != null -> "Glimt fikk ikke lest kvitteringen sikkert. Les den på nytt, eller fyll ut feltene selv."
        else -> "Lav sikkerhet fra ${r.provider ?: "lesingen"}${if (pct > 0) " ($pct %)" else ""}. Sjekk beløp og dato, eller les kvitteringen på nytt."
    }
    val shape = RoundedCornerShape(16.dp)
    Column(Modifier.fillMaxWidth().clip(shape).background(p.surf2).border(1.dp, p.line, shape).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(info, color = p.sub, fontSize = 13.5.sp, lineHeight = 19.sp)
        if (busy) {
            Text(if (ReState50.engine == "tesseract") "Lokal OCR leser kvitteringen …" else "Glimt leser lokalt …", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp)
            ReadSecs50(ReState50.started)
        } else FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Btn50("✦ Analyser på nytt lokalt", true, enabled = !localOff) { vm.reanalyze50(r.id) }
            Btn50("Les med lokal OCR", false, enabled = r.mime != "text/plain") { vm.reanalyze50(r.id, "tesseract") }
            if (err?.kind == GlimtErrKind50.SLOW) Btn50("Les mindre versjon", false, enabled = !localOff) { vm.reanalyze50(r.id, small = true) }
        }
        // Grunnen til at lesingen er av (en gammel server kan fortsatt si «Gemini-nøkkel mangler» – den vises ikke).
        if (localOff) Text(r.reanalyzeReason ?: "", color = p.sub, fontSize = 12.5.sp, lineHeight = 17.sp)
        if (err != null && !busy) Text(err.text, color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, lineHeight = 18.sp)
    }
}

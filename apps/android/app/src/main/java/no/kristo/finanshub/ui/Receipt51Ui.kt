package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.OcrRaw51
import no.kristo.finanshub.loadOcrRaw51
import no.kristo.finanshub.merchantSourceText51

// Prompt 51 (RCPTUI51): merkelapp for kilden til butikknavnet og den sammenleggbare «Rådata»-seksjonen (Receipt51.kt).

/** «fra org.nr.» (grønn), «kjent butikk», «modellens forslag» (oransje), «rettet av deg». Ingenting når kilden mangler. */
@Composable
internal fun MerchantSource51(source: String?, label: String?) {
    val text = merchantSourceText51(source, label) ?: return
    val p = PaperPal.current
    val c = when (source) { "orgnr" -> p.pos; "model" -> Color(0xFFB07612); else -> p.mut }
    Box(Modifier.clip(RoundedCornerShape(10.dp)).background(c.copy(alpha = 0.13f)).padding(horizontal = 8.dp, vertical = 3.dp)) {
        Text("Butikknavn $text", color = c, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 11.sp, maxLines = 1)
    }
}

/** «Rådata» (lukket som standard): OCR-motor, bildestørrelse og radene i mono. Uten raw hentes detaljen når den åpnes. */
@Composable
internal fun RawData51(vm: AppViewModel, receiptId: String?, raw: OcrRaw51?) {
    val p = PaperPal.current
    val scope = rememberCoroutineScope()
    var open by remember(receiptId) { mutableStateOf(false) }
    var loaded by remember(receiptId) { mutableStateOf<OcrRaw51?>(null) }
    var state by remember(receiptId) { mutableStateOf(0) } // 0 = ikke hentet, 1 = henter, 2 = ferdig
    val shown = raw ?: loaded
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = if (open) "Skjul rådata" else "Vis rådata") {
                open = !open
                if (open && shown == null && state == 0 && receiptId != null) {
                    state = 1
                    scope.launch { loaded = vm.loadOcrRaw51(receiptId); state = 2 }
                }
            }.padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            PLabel("RÅDATA", p.mut, 10.sp)
            Text(shown?.let { "· ${it.engineLabel} · ${it.rows.size} rader" } ?: "", color = p.mut, fontSize = 12.sp, maxLines = 1, modifier = Modifier.weight(1f))
            Text(if (open) "▴" else "▾", color = p.mut, fontSize = 12.sp)
        }
        if (open) {
            when {
                shown != null -> RawBody51(shown)
                state == 1 -> Text("Henter rådata …", color = p.mut, fontSize = 12.5.sp)
                else -> Text("Ingen OCR-rader er lagret for denne kvitteringen.", color = p.mut, fontSize = 12.5.sp)
            }
        }
    }
}

@Composable
private fun RawBody51(r: OcrRaw51) {
    val p = PaperPal.current
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Fact51("OCR-motor", r.engineLabel)
        Fact51("Bildestørrelse", r.sizeText)
        r.ms?.takeIf { it > 0 }?.let { Fact51("Tid", if (it < 1000) "$it ms" else String.format(java.util.Locale("nb", "NO"), "%.1f s", it / 1000.0)) }
        if (r.preprocess.isNotBlank()) Fact51("Forbehandling", r.preprocess)
        if (r.rows.isEmpty()) Text("OCR-en fant ingen tekst.", color = p.mut, fontSize = 12.5.sp)
        else SelectionContainer {
            Text(
                r.rows.mapIndexed { i, s -> "${(i + 1).toString().padStart(3)}  $s" }.joinToString("\n"),
                color = p.ink, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, lineHeight = 16.sp,
            )
        }
        Text("Står teksten riktig her, men feltene over er feil, ligger feilen i modellen. Mangler teksten, ligger den i OCR-en.", color = p.mut, fontSize = 11.5.sp)
    }
}

@Composable
private fun Fact51(k: String, v: String) {
    val p = PaperPal.current
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(k, color = p.mut, fontSize = 12.sp, modifier = Modifier.width(110.dp))
        Text(v, color = p.ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
    }
}

package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.AppPrefs
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.upload.PendingUpload

/*
 * Kvitteringer i Papir (prompt 18): ta bilde / velg filer, «Venter på opplasting», køen hos serveren og listen til gjennomgang.
 * Bekreftelsen av én kvittering bruker fortsatt ReceiptConfirm (den følger Papir-fargene via Tone.map).
 */

@Composable
internal fun PaperReceipts(vm: AppViewModel, navBottom: Dp, camera: () -> Unit, files: () -> Unit) {
    val p = PaperPal.current
    val q = vm.receipts
    val jobs = vm.jobs.filter { it.status != "booked" }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            PCard(shadow = true) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    PLabel("Kvitteringer")
                    PSerif("Ta bilde eller last opp", 26.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PButton("Ta bilde", Modifier.weight(1f), onClick = camera)
                        PButton("Bilder / filer", Modifier.weight(1f), kind = "line", onClick = files)
                    }
                }
            }
        }
        if (vm.pendingUploads.isNotEmpty()) {
            item { PHead("Venter på opplasting", if (vm.flag(AppPrefs.WIFI_ONLY)) "bare Wi-Fi" else null, rule = false) }
            item { PaperPendingCard(vm) }
        }
        if (jobs.isNotEmpty() || vm.uploading > 0) {
            // Prompt 21: ingen strek under etiketten (den stakk ut forbi kortets runde hjørner); skillelinjer bare mellom rader.
            item { PHead("Kø", rule = false) }
            item {
                PCard {
                    if (vm.uploading > 0) PRow("Laster opp ${vm.uploading} fil${if (vm.uploading > 1) "er" else ""}", "Sender til serveren …", "", serif = false)
                    jobs.forEachIndexed { i, j ->
                        val sub = when (j.status) {
                            "pending" -> "I kø"
                            "processing" -> "Leser … ${j.progress} %"
                            "needs_review" -> "Klar · trykk for å bekrefte"
                            "error" -> "Feilet · trykk for å analysere på nytt"
                            else -> j.status
                        }
                        PRow(if (j.status == "needs_review") j.merchant ?: j.name else j.name, sub, "›", serif = false, top = i > 0 || vm.uploading > 0) { vm.selectedReceipt = j.id }
                        if (j.status == "processing") LinearProgressIndicator(
                            progress = { j.progress / 100f },
                            Modifier.fillMaxWidth().padding(14.dp, 0.dp, 14.dp, 10.dp).height(3.dp).clip(RoundedCornerShape(2.dp)), color = p.ink, trackColor = p.line,
                        )
                    }
                }
            }
        }
        item { PHead("Til gjennomgang", q?.size?.takeIf { it > 0 }?.toString(), rule = false) }
        when {
            q == null -> item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
            q.isEmpty() -> item { Text("Ingen kvitteringer venter på gjennomgang.", color = p.mut, fontSize = 13.5.sp, modifier = Modifier.padding(8.dp)) }
            else -> item {
                PCard {
                    q.forEachIndexed { i, r ->
                        Column {
                            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                            Row(
                                Modifier.fillMaxWidth().clickable { vm.selectedReceipt = r.id }.padding(14.dp, 12.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                if (r.domain != null) Logo(vm, r.domain, r.merchant ?: "?", 0xFF8A8478, 40) else Thumb(vm, r.thumb)
                                Column(Modifier.weight(1f)) {
                                    Text(r.merchant ?: "Ny kvittering", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        when (r.status) { "needs_review" -> "${ddmm(r.date)} · ${r.provider ?: "manuell"}"; "error" -> "Feilet · trykk for å se"; else -> "Leser …" },
                                        color = if (r.status == "error") p.lab else p.mut, fontSize = 12.5.sp,
                                    )
                                }
                                r.total?.let { Text(n2(it), color = p.ink, fontFamily = PaperFonts.mono, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold) }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** «Venter på opplasting»: kvitteringer lagret på telefonen, med «Prøv igjen» og «Fjern». */
@Composable
internal fun PaperPendingCard(vm: AppViewModel) {
    val p = PaperPal.current
    PCard {
        vm.pendingUploads.forEachIndexed { i, u ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Row(Modifier.fillMaxWidth().padding(14.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(u.name.ifBlank { "Kvittering" }, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(pendingSub(u), color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                Text("Fjern", color = p.mut, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable { vm.removePending(u.id) }.padding(8.dp, 6.dp))
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                "${vm.pendingUploads.size} lagret på telefonen · sendes av seg selv når nettet er tilbake",
                color = p.mut, fontSize = 12.sp, modifier = Modifier.weight(1f).padding(end = 10.dp),
            )
            PButton(if (vm.pendingBusy) "Prøver …" else "Prøv igjen", height = 40.dp) { if (!vm.pendingBusy) vm.retryPending() }
        }
    }
}

internal fun pendingSub(u: PendingUpload): String {
    val tries = if (u.attempts > 0) " · ${u.attempts} forsøk" else ""
    return "Venter på opplasting$tries" + (u.lastError?.let { " · $it" } ?: "")
}

/** Arkene (Legg til / endre abonnement) i Papir: papirflate og blekk i stedet for den klassiske mørke flaten. */
internal fun sheetBg(): Color = PaperPal.current.bg
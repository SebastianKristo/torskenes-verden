package no.kristo.finanshub.ui

import androidx.compose.runtime.saveable.rememberSaveable
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/* ---------------- Studie → Dokumenter ---------------- */

@Composable
internal fun StudyScreen44(vm: AppViewModel) {
    val p = PaperPal.current
    val t = vm.p44
    val ctx = LocalContext.current
    BackHandler { if (t.doc != null) t.doc = null else t.studyOpen = false }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        uris.forEach { u ->
            val cr = ctx.contentResolver
            val data = runCatching { cr.openInputStream(u)?.use { it.readBytes() } }.getOrNull() ?: return@forEach
            val mime = cr.getType(u) ?: "application/octet-stream"
            val name = "dokument" + if (mime.contains("pdf")) ".pdf" else if (mime.contains("png")) ".png" else if (mime.contains("heic")) ".heic" else ".jpg"
            vm.uploadDoc44(name, mime, data)
        }
    }
    val navB = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    Column(Modifier.fillMaxSize().background(p.bg).statusBarsPadding()) {
        // Prompt 50 (claude-code-studie-topp-som-nyheter.md): topplinje som i Nyheter og Media – «‹ Tilbake»-pille, kicker + tittel
        // på samme rad, ✦ Glimt (velg dokument som Glimt leser) og ⋯ til høyre. Undertekst rett under raden; ingen egen stor tittel.
        val d0 = t.doc
        var menu50 by remember { mutableStateOf(false) }
        NewsTop50(
            if (d0 == null) "Studie · Dokumenter" else "Studie · Dokument", d0?.title ?: "Dokumenter",
            Modifier.padding(start = 16.dp, end = 12.dp, top = 8.dp), onBack = { if (t.doc != null) t.doc = null else t.studyOpen = false },
        ) {
            RoundBtn50("✦", "Glimt leser et dokument") { if (!t.docBusy) pick.launch(arrayOf("application/pdf", "image/*")) }
            Box {
                RoundBtn50("⋯", "Flere valg") { menu50 = true }
                androidx.compose.material3.DropdownMenu(menu50, { menu50 = false }, containerColor = p.card) {
                    androidx.compose.material3.DropdownMenuItem({ Text("Last opp dokument", color = p.ink) }, { menu50 = false; pick.launch(arrayOf("application/pdf", "image/*")) })
                    androidx.compose.material3.DropdownMenuItem({ Text("Hent listen på nytt", color = p.ink) }, { menu50 = false; vm.loadDocs44() })
                }
            }
        }
        Text(
            if (d0 == null) "Vitnemål, karakterutskrift og attester · Glimt leser og regner ut"
            else listOfNotNull(kindNo44(d0.kind), d0.institution, d0.date?.take(10)).joinToString(" · ").ifBlank { "Glimt leser og regner ut" },
            color = p.mut, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 2.dp, bottom = 12.dp),
        )
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, 24.dp + navB), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            val d = t.doc
            if (d == null) {
                item {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).border(1.5.dp, p.line, RoundedCornerShape(18.dp)).padding(18.dp),
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Vitnemål, karakterutskrift, attest eller kursbevis", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text("PDF, JPG, PNG eller HEIC · flere om gangen. Glimt leser og regner ut snitt og studiepoeng på hjemmeserveren.", color = p.mut, fontSize = 12.5.sp)
                        Btn43(if (t.docBusy) "Glimt leser …" else "Velg fil", dark = true, enabled = !t.docBusy) { pick.launch(arrayOf("application/pdf", "image/*")) }
                    }
                }
                if (t.docSteps.isNotEmpty()) item { Steps44(t.docSteps, t.docBusy) }
                t.docErr?.let { e -> item { Text(e, color = RED44u, fontSize = 13.sp) } }
                if (t.docsMissing) item { Text("Studie-dokumenter finnes ikke på serveren ennå. Oppdater Homelab.", color = p.mut, fontSize = 13.sp) }
                val ds = t.docs
                if (ds == null) item { Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
                else {
                    val sp = ds.sumOf { it.sp ?: 0.0 }
                    if (ds.isNotEmpty()) item {
                        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Kpi44("Studiepoeng", if (sp > 0) "%.0f".format(sp) else "–", p.ink)
                            Kpi44("Snitt", ds.firstNotNullOfOrNull { it.snitt } ?: "–", p.ink)
                            Kpi44("Dokumenter", "${ds.size}", p.ink)
                        }
                    }
                    if (ds.isEmpty() && !t.docsMissing) item { Text("Ingen dokumenter ennå.", color = p.mut, fontSize = 13.sp) }
                    ds.forEach { x ->
                        item(key = "doc-" + x.id) {
                            PCard(onClick = { t.doc = x; t.docAnswer = null }) {
                                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    PSerif(x.title, 18.sp, maxLines = 1)
                                    Text(listOfNotNull(kindNo44(x.kind), x.institution, x.date?.take(10), "${x.emner.size} emner", x.snitt?.let { "snitt $it" }).joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 2)
                                }
                            }
                        }
                    }
                }
            } else {
                item { DocView44(vm, d) }
            }
        }
    }
}

private fun kindNo44(k: String?) = when (k) { "vitnemal", "vitnemål", "diploma" -> "Vitnemål"; "karakterutskrift", "transcript" -> "Karakterutskrift"; "attest" -> "Attest"; "kursbevis", "course" -> "Kursbevis"; null -> null; else -> k.replaceFirstChar { it.uppercase() } }

@Composable
private fun Steps44(steps: List<String>, busy: Boolean) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        steps.forEach { Text("✓ $it", color = p.ink, fontSize = 13.sp) }
        if (busy) Row(verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(color = p.ink, strokeWidth = 2.dp, modifier = Modifier.size(14.dp)); Text("  Glimt leser fag og karakterer …", color = p.mut, fontSize = 13.sp) }
    }
}

private fun gradeColor44(g: String?): Color? {
    val k = g?.trim()?.uppercase() ?: return null
    return when (k) { "A", "B", "5", "6" -> GREEN44u; "D", "3" -> YEL44u; "E", "F", "1", "2" -> RED44u; else -> null }
}

@Composable
private fun DocView44(vm: AppViewModel, d: SDoc44) {
    val p = PaperPal.current
    var q by rememberSaveable(d.id) { mutableStateOf("") }
    var del by remember(d.id) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // Prompt 50: «type · institusjon · dato» står nå som undertekst under topplinja.
        d.summary?.let { Text(it, color = p.ink, fontSize = 14.sp, lineHeight = 20.sp) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Kpi44("Snitt", d.snitt ?: "–", p.ink)
            Kpi44("Studiepoeng", d.sp?.let { "%.0f".format(it) } ?: "%.0f".format(d.emner.sumOf { it.sp ?: 0.0 }), p.ink)
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(12.dp)) {
            Row { listOf("KODE" to .9f, "EMNE" to 2.2f, "SP" to .5f, "KAR." to .6f).forEach { (h, w) -> Text(h, color = p.mut, fontFamily = PaperFonts.mono, fontSize = 10.5.sp, modifier = Modifier.weight(w)) } }
            d.emner.forEach { e ->
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(e.kode, color = p.ink, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, modifier = Modifier.weight(.9f), maxLines = 1)
                    Text(e.navn, color = p.ink, fontSize = 13.sp, modifier = Modifier.weight(2.2f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(e.sp?.let { if (it % 1.0 == 0.0) "%.0f".format(it) else "%.1f".format(it) } ?: "", color = p.ink, fontSize = 12.5.sp, modifier = Modifier.weight(.5f))
                    Text(e.karakter ?: "", color = gradeColor44(e.karakter) ?: p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.weight(.6f))
                }
            }
        }
        if (d.found.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            PLabel("Glimt fant")
            d.found.forEach { Text("• $it", color = p.ink, fontSize = 13.5.sp) }
        }
        Field43(q, "Spør om dokumentet: «har jeg strøk?»", onDone = { vm.askDoc44(d, q) }) { q = it }
        vm.p44.docAnswer?.let { Text(it, color = p.ink, fontSize = 14.sp, lineHeight = 20.sp) }
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Btn43("Legg emner i Studie", dark = true, enabled = d.emner.isNotEmpty()) { vm.applyDoc44(d) }
            Btn43("Slett", color = RED44u) { del = true }
        }
        if (del) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Btn43("Slett dokumentet, teksten og søkedata", color = RED44u) { vm.deleteDoc44(d) }
            Btn43("Avbryt") { del = false }
        }
    }
}

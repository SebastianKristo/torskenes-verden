package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.Receipt
import no.kristo.finanshub.parseReceipts
import org.json.JSONObject

/*
 * Prompt 23: Kvitteringer i Papir, nøyaktig etter «Mobil Papir App» → kvitt:
 *  «Ta bilde av kvittering» (stort kort), Bilder og Filer, KØ (bare når noe er i køen), TIL GJENNOMGANG · N med rad som
 *  utvides (navn, beløp, kategori, ✓ Godkjenn og bokfør, ✦ På nytt, 🗑) og BOKFØRT · N med ↺ (tilbake til gjennomgang).
 *  Skillelinjer bare mellom radene, inne i kortet. FAB-en (skann) beholdes.
 */

/** Tilstand for siden: bokførte (GET /receipts?status=booked), åpen rad, utkast og «Klar» som er trykket på. */
class Receipts23State {
    var booked by mutableStateOf<List<Receipt>?>(null)
    var open by mutableStateOf<String?>(null)
    var drafts by mutableStateOf<Map<String, Rc23Draft>>(emptyMap())
    var seen by mutableStateOf<Set<String>>(emptySet())
    var busy by mutableStateOf<String?>(null)
}

data class Rc23Draft(val name: String, val amount: String, val categoryId: Int?)

private fun amountText(v: Double?): String = if (v == null) "" else String.format(java.util.Locale("nb", "NO"), "%.2f", v)

internal fun AppViewModel.loadBooked23() = launchNav {
    rc23.booked = parseReceipts(apiNav { get("/receipts?status=booked") }).take(20)
}

private suspend fun AppViewModel.refreshReceipts23() {
    loadReceipts(); loadJobs()
    rc23.booked = runCatching { parseReceipts(apiNav { get("/receipts?status=booked") }).take(20) }.getOrDefault(rc23.booked)
}

/** ✓ Godkjenn og bokfør: lagrer navn, beløp og kategori, så bokføres kvitteringen. */
internal fun AppViewModel.approve23(r: Receipt) = launchNav {
    val d = rc23.drafts[r.id]
    rc23.busy = r.id
    try {
        if (d != null) {
            val body = JSONObject()
            if (d.name.isNotBlank() && d.name != r.merchant) body.put("merchant", d.name.trim())
            parseAmount(d.amount)?.takeIf { it != r.total }?.let { body.put("total", it) }
            if (d.categoryId != r.categoryId) body.put("categoryId", d.categoryId ?: JSONObject.NULL)
            if (body.length() > 0) apiNav { patch("/receipts/${r.id}", body) }
        }
        apiNav { post("/receipts/${r.id}/book") }
        rc23.open = null
        rc23.drafts = rc23.drafts - r.id
        Haptics.success()
        message = "Bokført · ${d?.name?.ifBlank { null } ?: r.merchant ?: "kvittering"}"
        refreshReceipts23()
    } finally { rc23.busy = null }
}

/** ✦ På nytt / ✦ Analyser på nytt: kvitteringen leses igjen med Gemini (går til KØ). */
internal fun AppViewModel.reread23(id: String) = launchNav {
    apiNav { post("/receipts/$id/reprocess?provider=gemini") }
    rc23.open = null
    message = "✦ Leses på nytt med Gemini"
    refreshReceipts23()
}

internal fun AppViewModel.delete23(id: String) = launchNav {
    apiNav { delete("/receipts/$id") }
    rc23.open = null
    rc23.drafts = rc23.drafts - id
    message = "Kvitteringen er slettet"
    refreshReceipts23()
}

/** ↺ Tilbake til gjennomgang: POST /receipts/:id/unbook setter kvitteringen til needs_review igjen. */
internal fun AppViewModel.undo23(r: Receipt) = launchNav {
    apiNav { post("/receipts/${r.id}/unbook") }
    message = "Tilbake til gjennomgang"
    refreshReceipts23()
}

/** Én rad i KØ. */
private class QRow(val key: String, val name: String, val status: String, val color: Color, val pct: Float, val ready: Boolean, val go: (() -> Unit)?, val again: () -> Unit)

@Composable
internal fun PaperReceipts23(vm: AppViewModel, navBottom: Dp, camera: () -> Unit, photos: () -> Unit, files: () -> Unit) {
    val p = PaperPal.current
    val st = vm.rc23
    LaunchedEffect(vm.base) { vm.loadBooked23() }
    val receipts = vm.receipts
    val reviewAll = receipts?.filter { it.status == "needs_review" } ?: emptyList()
    // «Klar» i KØ: lest av AI i dag, men ikke trykket på ennå. Trykk → raden åpnes under Til gjennomgang.
    val readyJobs = vm.jobs.filter { it.status == "needs_review" && it.id !in st.seen && reviewAll.any { r -> r.id == it.id } }
    val readyIds = readyJobs.map { it.id }.toSet()
    val review = reviewAll.filter { it.id !in readyIds }
    val q = buildList {
        vm.pendingUploads.forEach { u ->
            add(QRow("u" + u.id, u.name.ifBlank { "Kvittering" }, "Venter på nett · sendes automatisk", p.mut, 1f, false, null) { vm.retryPending() })
        }
        if (vm.uploading > 0) add(QRow("up", if (vm.uploading == 1) "Laster opp 1 fil" else "Laster opp ${vm.uploading} filer", "✦ Leser … 0 %", p.lab, 0.02f, false, null) {})
        vm.jobs.filter { it.status == "pending" || it.status == "processing" || it.status == "error" }.forEach { j ->
            val err = j.status == "error"
            val pct = if (err) 1f else (j.progress.coerceIn(0, 99)) / 100f
            add(QRow(j.id, j.name, if (err) "Feilet · prøv ✦ Analyser på nytt" else j.statusText?.takeIf { it.isNotBlank() }?.let { t -> (if (t.startsWith("✦")) t else "✦ $t") + if (t.contains("svarte ikke")) "" else " ${j.progress.coerceIn(0, 99)} %" } ?: "✦ Leser … ${j.progress.coerceIn(0, 99)} %", p.lab, pct, false, null) { vm.reread23(j.id) })
        }
        readyJobs.forEach { j ->
            add(QRow(j.id, j.merchant ?: j.name, "Klar · trykk for å bekrefte", p.pos, 1f, true, {
                st.seen = st.seen + j.id; st.open = j.id; Haptics.select()
            }) { vm.reread23(j.id) })
        }
    }
    val booked = st.booked ?: emptyList()
    val cats = (vm.boot?.categories ?: emptyList()).filter { it.kind != "income" }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            val shape = RoundedCornerShape(22.dp)
            Row(
                Modifier.fillMaxWidth().shadow(14.dp, shape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
                    .clip(shape).background(p.card).clickable(onClickLabel = "Ta bilde av kvittering", onClick = camera).padding(16.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Box(Modifier.size(52.dp).clip(CircleShape).background(p.lab), contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.PhotoCamera, null, tint = Color.White, modifier = Modifier.size(24.dp))
                }
                Column(Modifier.weight(1f)) {
                    Text("Ta bilde av kvittering", color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 17.sp, maxLines = 1)
                    Text("Bakkamera · ✦ Gemini leser beløp og butikk", color = p.mut, fontFamily = PaperFonts.sans, fontSize = 13.sp, maxLines = 2)
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PickCard("Bilder", Modifier.weight(1f), { Icon(Icons.Outlined.Image, null, tint = p.ink, modifier = Modifier.size(20.dp)) }, photos)
                PickCard("Filer", Modifier.weight(1f), { Icon(Icons.Outlined.Description, null, tint = p.ink, modifier = Modifier.size(20.dp)) }, files)
            }
        }
        if (q.isNotEmpty()) {
            item { RcLabel("Kø") }
            item {
                RcCard {
                    q.forEachIndexed { i, x ->
                        Column {
                            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                            Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Column(
                                    Modifier.weight(1f).then(if (x.go != null) Modifier.clickable(onClick = x.go) else Modifier),
                                    verticalArrangement = Arrangement.spacedBy(5.dp),
                                ) {
                                    Text(x.name, color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(x.status, color = x.color, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Box(Modifier.fillMaxWidth().height(3.dp).clip(RoundedCornerShape(2.dp)).background(p.line)) {
                                        Box(Modifier.fillMaxHeight().fillMaxWidth(x.pct.coerceIn(0f, 1f)).clip(RoundedCornerShape(2.dp)).background(x.color))
                                    }
                                }
                                Text("✦ Analyser på nytt", color = p.lab, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp,
                                    modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(onClick = x.again).padding(vertical = 6.dp))
                            }
                        }
                    }
                }
            }
        }
        item { RcLabel("Til gjennomgang · ${review.size}") }
        when {
            receipts == null -> item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
            review.isEmpty() -> item {
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(16.dp)) {
                    Text("Alt er gjennomgått ✓", color = p.mut, fontFamily = PaperFonts.sans, fontSize = 14.sp)
                }
            }
            else -> item {
                RcCard {
                    review.forEachIndexed { i, r ->
                        Column {
                            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                            val open = st.open == r.id
                            RcRow(vm, r, meta = rcMeta(r, booked = false), onClick = { st.open = if (open) null else r.id; Haptics.select() })
                            if (open) RcEditor(vm, r, cats)
                        }
                    }
                }
            }
        }
        if (booked.isNotEmpty()) {
            item { RcLabel("Bokført · ${booked.size}") }
            item {
                RcCard {
                    booked.forEachIndexed { i, r ->
                        Column {
                            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                            RcRow(vm, r, meta = rcMeta(r, booked = true), onClick = null) {
                                Box(
                                    Modifier.size(30.dp).clip(CircleShape).clickable(onClickLabel = "Tilbake til gjennomgang") { vm.undo23(r) },
                                    contentAlignment = Alignment.Center,
                                ) { Text("↺", color = p.mut, fontSize = 15.sp) }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** «dato · motor · sikkerhet %» (gjennomgang) eller «dato · kategori» (bokført). */
private fun rcMeta(r: Receipt, booked: Boolean): String {
    val d = ddmm(r.date)
    if (booked) return listOfNotNull(d, r.match?.category?.ifBlank { null }).joinToString(" · ")
    val conf = r.confidence.let { if (it <= 1.0) it * 100 else it }
    return listOfNotNull(d, r.provider ?: "manuell", if (conf > 0) "${Math.round(conf)} % sikker" else null).joinToString(" · ")
}

@Composable
private fun RcLabel(text: String) = PLabel(text, color = PaperPal.current.lab, modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 6.dp))

/** Kortet rundt radene: radius 20, 2/16 dp innvendig, linjene klippes i hjørnene. */
@Composable
private fun RcCard(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(PaperPal.current.card).padding(horizontal = 16.dp, vertical = 2.dp)) { content() }
}

@Composable
private fun PickCard(label: String, modifier: Modifier, icon: @Composable () -> Unit, onClick: () -> Unit) {
    val p = PaperPal.current
    Row(
        modifier.height(56.dp).clip(RoundedCornerShape(20.dp)).background(p.card).clickable(onClickLabel = label, onClick = onClick),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
    ) {
        icon()
        Text(label, color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp)
    }
}

/** Butikklogo (logobiblioteket) i hvit 44 dp rute med strek, ellers forbokstaven. */
@Composable
private fun RcLogo(vm: AppViewModel, r: Receipt) {
    val p = PaperPal.current
    val name = r.merchant ?: "Kvittering"
    Box(Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(Color.White).border(1.dp, p.line, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
        if (r.domain != null || r.merchant != null) Logo(vm, r.domain, name, 0xFF8A8478, 30, RoundedCornerShape(6.dp))
        else Text(name.take(1), color = p.mut, fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
    }
}

@Composable
private fun RcRow(vm: AppViewModel, r: Receipt, meta: String, onClick: (() -> Unit)?, trailing: (@Composable () -> Unit)? = null) {
    val p = PaperPal.current
    Row(
        Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        RcLogo(vm, r)
        Column(Modifier.weight(1f)) {
            Text(r.merchant ?: "Ny kvittering", color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(meta, color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(r.total?.let { "−" + n2(it) } ?: "–", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, maxLines = 1)
        trailing?.invoke()
    }
}

/** Utvidet rad: navn og beløp, kategori-chips og knappene Godkjenn og bokfør, ✦ På nytt og 🗑. */
@Composable
private fun RcEditor(vm: AppViewModel, r: Receipt, cats: List<no.kristo.finanshub.Category>) {
    val p = PaperPal.current
    val st = vm.rc23
    val d = st.drafts[r.id] ?: Rc23Draft(r.merchant.orEmpty(), amountText(r.total), r.categoryId)
    fun set(n: Rc23Draft) { st.drafts = st.drafts + (r.id to n) }
    val field = Modifier.height(42.dp).clip(RoundedCornerShape(12.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp)
    Column(Modifier.fillMaxWidth().padding(bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(field.weight(1f), contentAlignment = Alignment.CenterStart) {
                BasicTextField(d.name, { set(d.copy(name = it)) }, singleLine = true, cursorBrush = SolidColor(p.ink),
                    textStyle = TextStyle(color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp), modifier = Modifier.fillMaxWidth())
            }
            Box(field.width(120.dp), contentAlignment = Alignment.CenterEnd) {
                BasicTextField(d.amount, { set(d.copy(amount = it)) }, singleLine = true, cursorBrush = SolidColor(p.ink),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    textStyle = TextStyle(color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, textAlign = TextAlign.End), modifier = Modifier.fillMaxWidth())
            }
        }
        if (cats.isNotEmpty()) Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            cats.forEach { c ->
                val on = d.categoryId == c.id
                Box(
                    Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).background(if (on) p.ink else Color.Transparent)
                        .border(1.dp, if (on) p.ink else p.line, RoundedCornerShape(16.dp)).clickable { set(d.copy(categoryId = c.id)); Haptics.select() }.padding(horizontal = 12.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(c.name, color = if (on) p.bg else p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1) }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val busy = st.busy == r.id
            Box(
                Modifier.weight(1f).height(42.dp).clip(RoundedCornerShape(21.dp)).background(p.ink).clickable(enabled = !busy) { vm.approve23(r) },
                contentAlignment = Alignment.Center,
            ) { Text(if (busy) "Bokfører …" else "✓ Godkjenn og bokfør", color = p.bg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1) }
            Box(
                Modifier.height(42.dp).clip(RoundedCornerShape(21.dp)).border(1.dp, p.line, RoundedCornerShape(21.dp)).clickable { vm.reread23(r.id) }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) { Text("✦ På nytt", color = p.lab, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1) }
            Box(
                Modifier.size(42.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(onClickLabel = "Slett") { vm.delete23(r.id) },
                contentAlignment = Alignment.Center,
            ) { Text("🗑", color = p.lab, fontSize = 16.sp) }
        }
    }
}

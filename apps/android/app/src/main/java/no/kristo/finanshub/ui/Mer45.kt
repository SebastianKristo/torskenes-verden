package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import org.json.JSONArray
import org.json.JSONObject

/*
 * Prompt 45 (claude-code-mer-tittel-og-store-bokser.md, fasit Mer Ny.dc.html):
 *  - Tittelen under søket («Hverdag og familie») kan skjules (−) og legges tilbake («+ Legg til tittel») i wiggle, og gis nytt navn ved trykk.
 *  - De fire store boksene velges fritt: hver har «⇄ Bytt» i wiggle → arket «Velg boks» med alle moduler (valgt har hake).
 *  Lagres per konto lokalt (papir_mer45_<konto>) og på serveren (PUT /api/me/layout {mer45}), så admin som redigerer et
 *  familiemedlems oppsett (Logg inn som) lagrer for den brukeren.
 */

internal object Mer45 {
    val DEF_BIG = listOf("kalender", "huske", "bursdag", "kart")
    private const val DEF_TITLE = "Hverdag og familie"
    /** Lest én gang per konto; endres i arket/redigeringen. */
    private var forAcct by mutableStateOf<String?>(null)
    private var titleV by mutableStateOf(DEF_TITLE)
    private var hideV by mutableStateOf(false)
    private var bigV by mutableStateOf(DEF_BIG)
    var pickFor by mutableStateOf<Int?>(null)

    private fun key(vm: AppViewModel) = "papir_mer45_" + (vm.account?.id ?: "")

    private fun ensure(vm: AppViewModel) {
        val k = key(vm)
        if (forAcct == k) return
        forAcct = k
        apply(runCatching { JSONObject(vm.prefs.str(k, "")) }.getOrNull())
        vm.launch45 {
            val raw = runCatching { vm.api45 { hlGet("/me/layout") } }.getOrNull() ?: return@launch45
            val o = runCatching { JSONObject(raw).optJSONObject("mer45") }.getOrNull() ?: return@launch45
            if (forAcct != k) return@launch45
            apply(o); vm.prefs.set(k, o.toString())
        }
    }

    private fun apply(o: JSONObject?) {
        if (o == null) return
        // Prompt 46: tom tittel (teksten slettet) er et gyldig valg – raden tegnes da ikke utenfor wiggle (ingen tomrom).
        titleV = if (o.has("title")) o.optString("title").trim() else DEF_TITLE
        hideV = o.optBoolean("hide", false)
        val a = o.optJSONArray("big")
        if (a != null && a.length() == 4) bigV = (0 until 4).map { a.optString(it) }.filter { it.isNotBlank() }.takeIf { it.size == 4 } ?: DEF_BIG
    }

    private fun save(vm: AppViewModel) {
        val o = JSONObject().put("title", titleV).put("hide", hideV).put("big", JSONArray(bigV))
        vm.prefs.set(key(vm), o.toString())
        vm.launch45 { runCatching { vm.api45 { hlPut("/me/layout", JSONObject().put("mer45", o)) } } }
    }

    fun title(vm: AppViewModel): String { ensure(vm); return titleV }
    fun titleHidden(vm: AppViewModel): Boolean { ensure(vm); return hideV }
    fun big(vm: AppViewModel): List<String> { ensure(vm); return bigV }
    fun setTitle(vm: AppViewModel, t: String) { titleV = t.trim(); save(vm) }
    /** Prompt 46 (claude-code-mer-tittel-fjern-mellomrom.md): skjult eller tom tittel → ingen tittelrad (heller ikke mellomrom). */
    fun showTitle(vm: AppViewModel): Boolean { ensure(vm); return !hideV && titleV.isNotBlank() }
    fun setHidden(vm: AppViewModel, h: Boolean) { Haptics.select(); hideV = h; save(vm) }
    /** Bytter boks [i] til [k]; ligger [k] allerede i en annen boks, bytter de plass. */
    fun setBig(vm: AppViewModel, i: Int, k: String) {
        val l = bigV.toMutableList()
        val j = l.indexOf(k)
        if (j >= 0 && j != i) l[j] = l[i]
        l[i] = k
        bigV = l; Haptics.select(); save(vm)
    }
}

/** I wiggle-redigering: tittelen (− / nytt navn / + Legg til tittel) og de fire store boksene med «⇄ Bytt». */
@Composable
internal fun MerEdit45(vm: AppViewModel, rows: List<MerItem28>) {
    val p = PaperPal.current
    if (Mer44.low(vm)) return
    val hidden = Mer45.titleHidden(vm)
    var text by remember(vm.account?.id) { mutableStateOf(Mer45.title(vm)) }
    Column(Modifier.fillMaxWidth().padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (hidden) Box(
            Modifier.height(36.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(role = Role.Button) { Mer45.setHidden(vm, false) }.padding(horizontal = 14.dp),
            contentAlignment = Alignment.Center,
        ) { Text("+ Legg til tittel", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
        else Box(Modifier.fillMaxWidth().padding(start = 10.dp, top = 8.dp)) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(12.dp)).padding(start = 22.dp, end = 12.dp, top = 10.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BasicTextField(
                    text, { text = it; Mer45.setTitle(vm, it) }, singleLine = true,
                    textStyle = TextStyle(color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, letterSpacing = 1.3.sp),
                    cursorBrush = SolidColor(p.lab), modifier = Modifier.weight(1f).semantics { contentDescription = "Tittel – trykk for å gi nytt navn" },
                )
                Text("✎", color = p.mut, fontSize = 14.sp)
            }
            MinusDot28("tittelen", Modifier.align(Alignment.TopStart)) { Mer45.setHidden(vm, true) }
        }
        val big = Mer45.big(vm)
        big.chunked(2).forEachIndexed { ri, ch ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ch.forEachIndexed { ci, k ->
                    val i = ri * 2 + ci
                    val r = rows.firstOrNull { it.key == k }
                    Row(
                        Modifier.weight(1f).height(64.dp).shadow(6.dp, RoundedCornerShape(18.dp)).clip(RoundedCornerShape(18.dp)).background(p.card)
                            .clickable(role = Role.Button, onClickLabel = "Bytt boks") { Haptics.select(); Mer45.pickFor = i }.padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        if (r != null) Box(Modifier.size(30.dp)) { MerIcon25(vm, r.index, r.key) }
                        Text(r?.title ?: k, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        Box(Modifier.clip(CircleShape).background(p.ink).padding(horizontal = 8.dp, vertical = 3.dp)) { Text("⇄", color = p.bg, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                    }
                }
            }
        }
    }
    Mer45.pickFor?.let { i -> PickBoxSheet45(vm, i, rows) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PickBoxSheet45(vm: AppViewModel, i: Int, rows: List<MerItem28>) {
    val p = PaperPal.current
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val cur = Mer45.big(vm).getOrNull(i)
    val close = { Mer45.pickFor = null }
    ModalBottomSheet(
        onDismissRequest = close, sheetState = state, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) },
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PSerif("Velg boks", 24.sp, modifier = Modifier.weight(1f), maxLines = 1)
                SheetButton30("Ferdig", onClick = close)
            }
            Column(Modifier.fillMaxWidth().heightIn(max = 520.dp).verticalScroll(rememberScrollState()).clip(RoundedCornerShape(20.dp)).background(p.card)) {
                rows.filter { it.key != "innst" }.forEachIndexed { n, r ->
                    if (n > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 60.dp).clickable(role = Role.Button, onClickLabel = r.title) { Mer45.setBig(vm, i, r.key); close() }.padding(horizontal = 14.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        MerIcon25(vm, r.index, r.key)
                        Column(Modifier.weight(1f)) {
                            Text(r.title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1)
                            Text(liveSub44(vm, r.key, r.sub), color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        if (r.key == cur) Text("✓", color = p.pos, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                    }
                }
            }
        }
    }
}

/* ======================= Finans → Mer i samme design (claude-code-finans-mer-samme-design.md) ======================= */

private var finQ45 by mutableStateOf("")
private val FIN_BIG45 = listOf("kontoer", "budsjett", "kvitt", "faste")

/**
 * Finans → Mer som hoved-Mer: «Søk i moduler», tittel FINANS, fire store kort (Saldo · Budsjett · Kvitteringer · Faste trekk, ekte tall
 * fra FinansHub), «Verktøy»-liste (ikon, navn, kort status) og Innstillinger-raden nederst. Hold inne → wiggle (flytt/skjul, som før).
 */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
internal fun FinMer45(vm: AppViewModel, tiles: List<FinTile>, navBottom: androidx.compose.ui.unit.Dp, wide: Boolean, onLong: () -> Unit) {
    val p = PaperPal.current
    val q = finQ45.trim().lowercase()
    fun hit(t: FinTile) = q.isEmpty() || t.title.lowercase().contains(q) || t.value.lowercase().contains(q)
    val byKey = tiles.associateBy { it.key }
    val big = FIN_BIG45.mapNotNull { byKey[it] }.filter(::hit)
    val tools = tiles.filter { it.key !in FIN_BIG45 && it.key != "innst" && hit(it) }
    val sm = vm.summary
    val accts = vm.boot?.accounts
    val review = vm.reviewCount ?: vm.boot?.reviewCount ?: 0
    val nextFast = vm.recurring?.filter { it.active && it.next != null }?.minByOrNull { it.next!! }
    androidx.compose.foundation.lazy.LazyColumn(
        Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item(key = "fm45-q") {
            Row(Modifier.fillMaxWidth().padding(top = 4.dp).heightIn(min = 48.dp).shadow(6.dp, RoundedCornerShape(24.dp)).clip(RoundedCornerShape(24.dp)).background(p.card)
                .padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("⌕", color = p.mut, fontSize = 17.sp)
                Box(Modifier.weight(1f).padding(start = 8.dp)) {
                    if (finQ45.isEmpty()) Text("Søk i moduler", color = p.mut, fontSize = 15.sp)
                    BasicTextField(finQ45, { finQ45 = it }, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 15.sp), cursorBrush = SolidColor(p.lab), modifier = Modifier.fillMaxWidth())
                }
                if (finQ45.isNotEmpty()) Text("✕", color = p.mut, modifier = Modifier.semantics { contentDescription = "Tøm søket" }.size(40.dp).clip(CircleShape).clickable { finQ45 = "" }.wrapContentSize())
            }
        }
        if (big.isNotEmpty()) {
            item(key = "fm45-hl") { PLabel("Finans", modifier = Modifier.padding(start = 4.dp, top = 4.dp)) }
            big.chunked(if (wide) 4 else 2).forEachIndexed { i, ch ->
                item(key = "fm45-c$i") {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        ch.forEach { t ->
                            val (lab, main, sub) = when (t.key) {
                                "kontoer" -> Triple("Saldo", accts?.let { "${neg0(it.sumOf { a -> a.balance })} kr" } ?: "–", accts?.let { "${it.size} ${if (it.size == 1) "konto" else "kontoer"}" } ?: "Kontoer")
                                "budsjett" -> Triple("Budsjett", sm?.takeIf { it.budgetTotal > 0 }?.let { "${Math.round(it.budgetUsed / it.budgetTotal * 100)} %" } ?: "–",
                                    sm?.let { "brukt · ${it.daysLeft} dager igjen" } ?: "Per kategori")
                                "kvitt" -> Triple("Kvitteringer", "$review", if (review > 0) "til gjennomgang" else "alt er gjennomgått")
                                else -> Triple("Faste trekk", nextFast?.name ?: "–", nextFast?.let { f -> "neste ${f.next.orEmpty().take(10)} · ${n0(f.amount)} kr" } ?: "Ingen kommende")
                            }
                            Column(
                                Modifier.weight(1f).height(150.dp).shadow(8.dp, RoundedCornerShape(22.dp), ambientColor = androidx.compose.ui.graphics.Color.Black.copy(alpha = .25f), spotColor = androidx.compose.ui.graphics.Color.Black.copy(alpha = .25f))
                                    .clip(RoundedCornerShape(22.dp)).background(p.card)
                                    .combinedClickable(role = Role.Button, onClickLabel = lab, onLongClick = { Haptics.tap(); onLong() }) { Haptics.select(); t.go() }.padding(14.dp),
                                verticalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    val tint = androidx.compose.ui.graphics.Color(FM_COLORS[t.key] ?: 0xFF6F6A60)
                                    Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(androidx.compose.ui.graphics.lerp(p.card, tint, .14f)), contentAlignment = Alignment.Center) {
                                        androidx.compose.material3.Icon(t.icon, null, tint = tint, modifier = Modifier.size(17.dp))
                                    }
                                    Text(lab, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    PSerif(main, if (main.length <= 9) 30.sp else 20.sp, maxLines = 2)
                                    Text(sub, color = if (t.key == "kvitt" && review > 0) p.lab else p.mut, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                        repeat((if (wide) 4 else 2) - ch.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }
        if (tools.isNotEmpty()) {
            item(key = "fm45-tl") { PLabel("Verktøy", modifier = Modifier.padding(start = 4.dp, top = 6.dp)) }
            item(key = "fm45-tools") { PCard(shadow = true) { tools.forEachIndexed { i, t -> FinMerRow45(t, i > 0, onLong) } } }
        }
        tiles.firstOrNull { it.key == "innst" }?.takeIf(::hit)?.let { st ->
            item(key = "fm45-set") { Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card)) { FinMerRow45(st, false, onLong) } }
        }
        if (big.isEmpty() && tools.isEmpty()) item(key = "fm45-none") { Text("Ingen moduler heter «$finQ45».", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(4.dp)) }
        item(key = "fm45-hint") {
            Text("Hold inne for å endre rekkefølgen eller skjule sider.", color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.sp,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(4.dp, 2.dp))
        }
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun FinMerRow45(t: FinTile, top: Boolean, onLong: () -> Unit) {
    val p = PaperPal.current
    val tint = androidx.compose.ui.graphics.Color(FM_COLORS[t.key] ?: 0xFF6F6A60)
    Column {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().combinedClickable(role = Role.Button, onClickLabel = t.title, onLongClick = { Haptics.tap(); onLong() }) { Haptics.select(); t.go() }
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(androidx.compose.ui.graphics.lerp(p.card, tint, .14f)), contentAlignment = Alignment.Center) {
                androidx.compose.material3.Icon(t.icon, null, tint = tint, modifier = Modifier.size(21.dp))
            }
            Column(Modifier.weight(1f)) {
                PSerif(t.title, 19.sp, maxLines = 1)
                Text(t.value, color = if (t.pos) p.pos else p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            t.badge?.let { b -> Box(Modifier.clip(CircleShape).background(p.lab).padding(8.dp, 2.dp)) { Text(b, color = p.onLab, fontSize = 11.sp, fontWeight = FontWeight.Bold) } }
            Text("›", color = p.mut, fontSize = 17.sp)
        }
    }
}

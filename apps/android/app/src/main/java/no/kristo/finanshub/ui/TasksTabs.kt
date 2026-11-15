package no.kristo.finanshub.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import org.json.JSONArray
import kotlin.math.roundToInt

/*
 * Prompt 43 (claude-code-gjoremal-faner-rekkefolge.md): pillene i Gjøremål.
 *  - Rekkefølge: [lister i valgt rekkefølge, Arkivert, Laget med Glimt] og «+ Ny liste» ALLTID sist (ikke del av sorteringen).
 *  - Hold inne en pille (lang-trykk, haptikk) → arket «Rekkefølge på lister»: dra i ≡ eller ▲ ▼, Tilbakestill, Ferdig.
 *  - Lagres per bruker i `huske_tab_order_<bruker>` (JSON-liste med nøkler). Nye lister havner sist, slettede fjernes.
 * Nøkler: "alle", "l:<liste-id>", "arch", "glimt". Ingen ny avhengighet (ikke sh.calvin.reorderable): enkel dra-logikk med fast radhøyde.
 */
internal object TaskOrder43 {
    var order by mutableStateOf<List<String>?>(null)
    var loadedFor by mutableStateOf<String?>(null)
    var sheet by mutableStateOf(false)

    private fun key(vm: AppViewModel) = "huske_tab_order_" + (vm.account?.id?.toString() ?: "x")

    fun ensure(vm: AppViewModel) {
        val k = key(vm)
        if (loadedFor == k) return
        loadedFor = k
        order = runCatching { JSONArray(vm.prefs.str(k, "")).let { a -> (0 until a.length()).map { a.getString(it) } } }.getOrNull()
        // Synkes med profilen: GET /api/tasks/lists/order → {ids:[«alle», liste-id, «arkivert», «glimt»], custom} (404 = eldre server).
        vm.launch43 {
            runCatching {
                val o = org.json.JSONObject(vm.api43 { hlGet("/tasks/lists/order") })
                if (o.optBoolean("custom", true)) o.optJSONArray("ids")?.let { a -> (0 until a.length()).map { fromSrv(a.getString(it)) } }?.let { l ->
                    if (loadedFor == k) { order = l; vm.prefs.set(k, JSONArray(l).toString()) }
                }
            }
        }
    }

    private fun fromSrv(x: String) = when (x) { "alle", "glimt" -> x; "arkivert" -> "arch"; else -> "l:$x" }
    private fun toSrv(x: String) = when (x) { "alle", "glimt" -> x; "arch" -> "arkivert"; else -> x.removePrefix("l:") }

    fun save(vm: AppViewModel, o: List<String>?) {
        order = o
        vm.prefs.set(key(vm), if (o == null) "" else JSONArray(o).toString())
        vm.launch43 {
            runCatching { vm.api43 { hlPut("/tasks/lists/order", if (o == null) org.json.JSONObject().put("reset", true) else org.json.JSONObject().put("ids", JSONArray(o.map(::toSrv)))) } }
        }
    }

    /** Standard: Alle, egne lister, Arkivert, Laget med Glimt. */
    fun defaults(listKeys: List<String>) = listOf("alle") + listKeys + listOf("arch", "glimt")

    /** Lagret rekkefølge renset mot det som finnes nå; nye nøkler legges sist. */
    fun sorted(listKeys: List<String>): List<String> {
        val all = defaults(listKeys)
        val saved = order ?: return all
        return saved.filter { it in all } + all.filter { it !in saved }
    }
}

@OptIn(ExperimentalFoundationApi::class)
internal fun Modifier.pressOrHold43(label: String, onClick: () -> Unit, onHold: () -> Unit): Modifier =
    this.combinedClickable(onClickLabel = label, onLongClickLabel = "Endre rekkefølge", onLongClick = { Haptics.tap(); onHold() }, onClick = onClick)

/** «Laget med Glimt»-pillen i raden (bare når det finnes minst én beskjed). */
@Composable
internal fun GlimtSourcesChip43(vm: AppViewModel, onHold: () -> Unit) {
    val p = PaperPal.current
    LaunchedEffect(vm.account?.id, vm.tasks) { if (vm.p41.sources == null || vm.p41.glimtJobs.isEmpty()) vm.loadSources41() }
    val n = vm.p41.sources?.size ?: 0
    if (n == 0) return
    Row(
        Modifier.height(38.dp).clip(CircleShape).background(p.card).pressOrHold43("Laget med Glimt", { Haptics.select(); vm.p41.srcOpen = true }, onHold).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(p.lab))
        Text("Laget med Glimt", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
        Text("$n", color = p.ink.copy(alpha = .6f), fontWeight = FontWeight.Bold, fontSize = 13.sp)
    }
}

/** «+ Ny liste»: card-flate, ink-tekst (700, 13), 1,5 dp stiplet kant i ink 40 %. */
@Composable
internal fun NewListChip43(onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        Modifier.height(38.dp).clip(CircleShape).background(p.card).drawBehind {
            drawRoundRect(p.ink.copy(alpha = .4f), cornerRadius = CornerRadius(size.height / 2),
                style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx()))))
        }.clickable(role = Role.Button, onClickLabel = "Ny liste") { onClick() }.padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) { Text("+ Ny liste", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1) }
}

/** Arket «Rekkefølge på lister». [items] = (nøkkel, navn, farge). Endringer vises med en gang i raden bak. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TabOrderSheet43(vm: AppViewModel, items: List<Triple<String, String, Color>>, listKeys: List<String>) {
    val p = PaperPal.current
    val cur = TaskOrder43.sorted(listKeys)
    val byKey = items.associateBy { it.first }
    val rows = cur.mapNotNull { byKey[it] }
    val rowH = 56.dp
    var dragKey by remember { mutableStateOf<String?>(null) }
    var dragY by remember { mutableStateOf(0f) }
    fun move(k: String, to: Int) {
        val l = TaskOrder43.sorted(listKeys).toMutableList()
        val from = l.indexOf(k)
        if (from < 0) return
        val t = to.coerceIn(0, l.size - 1)
        if (t == from) return
        l.removeAt(from); l.add(t, k)
        TaskOrder43.save(vm, l)
        Haptics.select()
    }
    ModalBottomSheet(
        onDismissRequest = { TaskOrder43.sheet = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = p.bg, contentColor = p.ink, dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) },
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(18.dp, 0.dp, 18.dp, 22.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PSerif("Rekkefølge på lister", 24.sp, modifier = Modifier.weight(1f), maxLines = 1)
                Text("Tilbakestill", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                    modifier = Modifier.clip(CircleShape).clickable { Haptics.select(); TaskOrder43.save(vm, null) }.padding(10.dp, 8.dp))
            }
            Text("Dra i ≡ eller bruk pilene. «+ Ny liste» ligger alltid sist.", color = p.mut, fontSize = 13.sp)
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card)) {
                rows.forEachIndexed { i, (k, name, color) ->
                    val dragging = dragKey == k
                    Row(
                        Modifier.fillMaxWidth().height(rowH).then(if (dragging) Modifier.offset { IntOffset(0, dragY.roundToInt()) }.background(p.bg) else Modifier)
                            .padding(start = 6.dp, end = 8.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Box(
                            Modifier.size(44.dp).pointerInput(k) {
                                val h = rowH.toPx()
                                detectDragGestures(
                                    onDragStart = { dragKey = k; dragY = 0f; Haptics.tap() },
                                    onDragEnd = { dragKey = null; dragY = 0f }, onDragCancel = { dragKey = null; dragY = 0f },
                                ) { ch, d ->
                                    ch.consume()
                                    dragY += d.y
                                    val idx = TaskOrder43.sorted(listKeys).indexOf(k)
                                    if (dragY > h * .6f) { move(k, idx + 1); dragY -= h } else if (dragY < -h * .6f) { move(k, idx - 1); dragY += h }
                                }
                            },
                            contentAlignment = Alignment.Center,
                        ) { Text("≡", color = p.mut, fontSize = 20.sp) }
                        Box(Modifier.size(9.dp).clip(CircleShape).background(color))
                        Text(name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, modifier = Modifier.weight(1f))
                        Text("▲", color = if (i > 0) p.ink else p.line, fontSize = 13.sp, modifier = Modifier.size(40.dp).clip(CircleShape)
                            .clickable(enabled = i > 0, onClickLabel = "Flytt opp") { move(k, i - 1) }.wrapContentSize())
                        Text("▼", color = if (i < rows.size - 1) p.ink else p.line, fontSize = 13.sp, modifier = Modifier.size(40.dp).clip(CircleShape)
                            .clickable(enabled = i < rows.size - 1, onClickLabel = "Flytt ned") { move(k, i + 1) }.wrapContentSize())
                    }
                    if (i < rows.size - 1) Box(Modifier.fillMaxWidth().padding(start = 50.dp).height(1.dp).background(p.line))
                }
            }
            Box(
                Modifier.fillMaxWidth().height(50.dp).clip(CircleShape).background(p.ink).clickable { TaskOrder43.sheet = false },
                contentAlignment = Alignment.Center,
            ) { Text("Ferdig", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 15.sp) }
        }
    }
}

package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.SaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.withTimeoutOrNull
import no.kristo.finanshub.*

/*
 * Prompt 26 (ANDROID-B): trykk på aktiv fane (claude-code-mer-fane.md) og «Rediger fanelinjen» for Finans.
 *  - Trykk på aktiv fane på en underside → fanens rot (Mer → Mer-menyen, Finans → Mer → Finans → Mer, osv.).
 *  - Trykk igjen på roten → siden bygges på nytt øverst (scrollposisjonen glemmes).
 *  - Hold inne på linja (redigering) tar resten av trykket, så fanen under ikke får et klikk, og neste trykk virker som vanlig.
 */

/* ---------------- Aktiv fane ---------------- */

/** Lukker undersider og lag inne i en fane (detaljer, valgt pakke, innstillingsside …). */
private fun AppViewModel.clearLayers26() {
    original = null; editing = null; detail = null; detailTx = null; selectedTx = null; editHome = false
    finnSel = null; finnDetail = null; trkSel = null; matFull = false; dishOpen = null; folder = null; selectedReceipt = null
    stockScreen = "ov"; stockSel = null; stockFrom = null; domainManager = false
    settingsPage = null; b26.kalFrom = null
    if (trkPicking) trkPickDone()
}

/** Trykk på fanen som allerede er markert: til fanens rot, eller til toppen når man allerede står der. */
internal fun AppViewModel.tabReselect26(bar: String, t: NavTab) {
    val before = navShotKey(this)
    clearLayers26()
    when {
        bar == "main" && t.key == "mer" -> {
            if (paperFromMer || paperFromFinMer || screen !in setOf(Screen.Homelab, Screen.Home, Screen.Mat, Screen.Tracking)) go(Screen.Homelab)
            paperPage = "mer"
        }
        bar == "main" && t.key == "hjem" -> { paperPage = null; go(Screen.Homelab) }
        bar == "fin" && t.key == "fmer" -> { if (paperFromFinMer) go(Screen.Home); paperFinTab("fmer") }
        else -> t.go()
    }
    if (navShotKey(this) == before) b26.topSeq++
}

/** Kalles i PaperApp før siden tegnes: etter et nytt trykk på aktiv fane glemmes scrollposisjonen, så siden står øverst. */
internal fun topReset26(vm: AppViewModel, nav: Nav23, holder: SaveableStateHolder, key: String) {
    val b = vm.b26
    if (b.topSeq == b.topDone) return
    b.topDone = b.topSeq
    holder.removeState(key)
    nav.meters.remove(key)
}

/**
 * Hold inne (500 ms) på fanelinja: som longPressEdit, men resten av trykket tas her (consume til fingeren slippes),
 * så fanen under ikke får et klikk. Hvert nytt trykk starter på nytt, så det neste trykket virker som vanlig.
 */
internal fun Modifier.longPressEdit26(enabled: Boolean, key: Any?, onLong: () -> Unit): Modifier = if (!enabled) this else this.pointerInput(key) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        val ended = withTimeoutOrNull(500L) {
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Initial)
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                if (!ch.pressed) break
                if ((ch.position - down.position).getDistance() > viewConfiguration.touchSlop) break
            }
            true
        }
        if (ended == null) {
            onLong()
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Initial)
                ev.changes.forEach { it.consume() }
                if (ev.changes.none { it.pressed }) break
            }
        }
    }
}

/* ---------------- Finans: «Rediger fanelinjen» ---------------- */

internal fun finIcon26(k: String) = when (k) {
    "oversikt" -> "◎"; "liste" -> "≡"; "finn" -> "⇄"; "sok" -> "⌕"; "budsjett" -> "◔"; "kvitt" -> "▤"; "aksjer" -> "↗"; "abo" -> "↻"; "kontoer" -> "▥"; "boliger" -> "⌂"; else -> "•"
}
private fun finName26(k: String) = FIN_TABS.firstOrNull { it.first == k }?.second ?: k

/** Ikonene en Finans-fane kan få (Hjem-ikonene og Finans-tegnene). */
private val FIN_ICONS26 = (listOf("◎", "≡", "⇄", "⌕", "◔", "▤", "↗", "↻", "▥", "⌂", "kr") + TAB_ICONS).distinct()

/**
 * Samme editor som for Hjem (design: FINANS · FANELINJE): navn, ikon, flytt (↑), fjern (−), stil med forhåndsvisning,
 * legg til (maks 5, Mer står alltid sist) og «Tilbakestill til standard». Lagres når arket lukkes eller med Ferdig.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun FinTabBarEditor26(vm: AppViewModel) {
    val p = PaperPal.current
    fun current() = vm.paperFinTabs.map { FinItem26(it, vm.finTabLabel26(it, finName26(it)), vm.finTabIcon26(it, finIcon26(it))) }
    var items by remember { mutableStateOf(current()) }
    var dirty by remember { mutableStateOf(false) }
    var iconFor by remember { mutableStateOf<String?>(null) }
    fun set(v: List<FinItem26>) { items = v; dirty = true }
    val close: () -> Unit = {
        if (dirty) vm.saveFinNav26(items, ::finName26, ::finIcon26)
        vm.b26.finEdit = false
    }
    ModalBottomSheet(onDismissRequest = close, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(18.dp, 0.dp, 18.dp, 34.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    PLabel("Finans · fanelinje")
                    PSerif("Rediger fanelinjen", 26.sp, modifier = Modifier.padding(top = 4.dp))
                }
                Box(Modifier.height(40.dp).clip(CircleShape).background(p.ink).clickable(role = Role.Button, onClick = close).padding(horizontal = 18.dp), contentAlignment = Alignment.Center) {
                    Text("Ferdig", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
                }
            }
            Text("${items.size} av 5 faner · Mer står alltid sist", color = p.mut, fontSize = 12.5.sp)
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(12.dp, 4.dp)) {
                items.forEachIndexed { i, t ->
                    Column(Modifier.padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(
                                Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(p.bg)
                                    .border(1.5.dp, if (iconFor == t.key) p.ink else p.line, RoundedCornerShape(14.dp))
                                    .clickable(role = Role.Button, onClickLabel = "Velg ikon") { iconFor = if (iconFor == t.key) null else t.key },
                                contentAlignment = Alignment.Center,
                            ) { GlyphIcon(t.icon, p.ink, 19.dp) }
                            BasicTextField(
                                t.label, { v -> set(items.map { if (it.key == t.key) it.copy(label = v.take(18)) else it }) }, singleLine = true,
                                textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, fontFamily = PaperFonts.sans),
                                cursorBrush = SolidColor(p.lab),
                                modifier = Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(14.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(12.dp, 12.dp),
                                decorationBox = { inner -> Box { if (t.label.isEmpty()) Text(finName26(t.key), color = p.mut, fontSize = 15.sp); inner() } },
                            )
                            Box(
                                Modifier.size(44.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).alpha(if (i > 0) 1f else .3f)
                                    .clickable(enabled = i > 0, role = Role.Button, onClickLabel = "Flytt til venstre") { set(items.toMutableList().also { l -> val x = l[i]; l[i] = l[i - 1]; l[i - 1] = x }) },
                                contentAlignment = Alignment.Center,
                            ) { Text("↑", color = p.ink, fontSize = 15.sp) }
                            Box(
                                Modifier.size(44.dp).clip(CircleShape).alpha(if (items.size > 1) 1f else .3f)
                                    .clickable(enabled = items.size > 1, role = Role.Button, onClickLabel = "Fjern") { set(items.filter { it.key != t.key }) },
                                contentAlignment = Alignment.Center,
                            ) { Text("−", color = p.lab, fontSize = 20.sp) }
                        }
                        if (iconFor == t.key) FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            FIN_ICONS26.forEach { ic ->
                                val on = ic == t.icon
                                Box(
                                    Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(if (on) p.ink else p.bg).border(1.dp, p.line, RoundedCornerShape(12.dp))
                                        .clickable { set(items.map { if (it.key == t.key) it.copy(icon = ic) else it }); iconFor = null },
                                    contentAlignment = Alignment.Center,
                                ) { GlyphIcon(ic, if (on) p.bg else p.ink) }
                            }
                        }
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                }
                Row(Modifier.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) { GlyphIcon("⋯", p.mut, 19.dp) }
                    Text("Mer · alltid sist", color = p.mut, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            NavStyleSection25(vm, items.map { TabItem(it.key, it.label.ifBlank { finName26(it.key) }, it.icon) })
            val missing = FIN_TABS.filter { (k, _) -> items.none { it.key == k } }
            if (missing.isNotEmpty() && items.size < 5) {
                PLabel("Legg til")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    missing.forEach { (k, n) ->
                        Row(
                            Modifier.height(40.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape)
                                .clickable { set(items + FinItem26(k, n, finIcon26(k))) }.padding(horizontal = 14.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
                        ) {
                            GlyphIcon(finIcon26(k), p.ink, 15.dp)
                            Text("+ $n", color = p.ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
            Text(
                "Tilbakestill til standard", color = p.mut, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, textDecoration = TextDecoration.Underline,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { vm.resetFinNav26(); items = current(); dirty = false }.padding(4.dp, 10.dp),
            )
        }
    }
}

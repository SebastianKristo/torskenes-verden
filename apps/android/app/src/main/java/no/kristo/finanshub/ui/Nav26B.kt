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
    "oversikt" -> "◎"; "liste" -> "≡"; "finn" -> "⇄"; "sok" -> "⌕"; "budsjett" -> "◔"; "kvitt" -> "▤"; "aksjer" -> "↗"; "abo" -> "↻"; "kontoer" -> "▥"; "boliger" -> "⌂"; "chat" -> "✦"; else -> "•"
}
private fun finName26(k: String) = FIN_TABS.firstOrNull { it.first == k }?.second ?: k

/** Ikonene en Finans-fane kan få (Hjem-ikonene og Finans-tegnene). */
private val FIN_ICONS26 = (listOf("◎", "≡", "⇄", "⌕", "◔", "▤", "↗", "↻", "▥", "⌂", "kr") + TAB_ICONS).distinct()

/**
 * Samme editor som for Hjem (design: FINANS · FANELINJE): navn, ikon, flytt (↑), fjern (−), stil med forhåndsvisning,
 * legg til (maks 5, Mer står alltid sist) og «Tilbakestill til standard». Lagres når arket lukkes eller med Ferdig.
 */
@Composable
internal fun FinTabBarEditor26(vm: AppViewModel) {
    // Prompt 32: det felles arket (ui/Ui32b.kt) med Ferdig som Papir-pille og uten «Mer»-rad.
    fun current() = vm.paperFinTabs.map { NavEd32b(it, vm.finTabLabel26(it, finName26(it)), vm.finTabIcon26(it, finIcon26(it))) }
    NavEditor32b(
        vm, "Finans", current(), FIN_TABS.map { (k, n) -> NavEd32b(k, n, finIcon26(k)) }, 5, mer = true, icons = FIN_ICONS26,
        onSave = { l -> vm.saveFinNav26(l.map { FinItem26(it.key, it.label, it.icon) }, ::finName26, ::finIcon26) },
        onReset = { vm.resetFinNav26(); current() },
        onClose = { vm.b26.finEdit = false },
    )
}

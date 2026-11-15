package no.kristo.kalender.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import no.kristo.kalender.KAddr44
import no.kristo.kalender.KAtt44
import no.kristo.kalender.KEv
import no.kristo.kalender.KNewForm
import no.kristo.kalender.KUser44
import no.kristo.kalender.Kal44
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red
import no.kristo.kalender.today

/* Konflikt («Endret et annet sted») og gjentakende («Bare denne / Denne og fremtidige») ved Lagre (prompt 44). */

/* ---------------- Konflikt og gjentakende ---------------- */

/** «Endret et annet sted. Behold din eller deres?» og «Bare denne / Denne og fremtidige / Alle». */
@Composable
fun Dialogs44(vm: KalVm) {
    val k = LocalK.current
    if (vm.conflict44 != null) Box(Modifier.fillMaxSize().background(k.dim).tap("Lukk") { vm.resolveConflict44(false) }, contentAlignment = Alignment.Center) {
        Column(Modifier.padding(16.dp).widthIn(max = 420.dp).clip(RoundedCornerShape(20.dp)).background(k.card).tap(null) {}.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Tx("Endret et annet sted", news(KType.title3, k.ink))
            Tx("Hendelsen er endret i kilden siden du åpnet den. Behold din eller deres?", man(KType.subheadline, FontWeight.Medium, k.mut), maxLines = 3)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LinePill("Bruk deres", { vm.resolveConflict44(false) })
                InkPill("Behold din", { vm.resolveConflict44(true) })
            }
        }
    }
    if (vm.askScope44) Box(Modifier.fillMaxSize().background(k.dim).tap("Lukk") { vm.askScope44 = false }, contentAlignment = Alignment.Center) {
        Column(Modifier.padding(16.dp).widthIn(max = 420.dp).clip(RoundedCornerShape(20.dp)).background(k.card).tap(null) {}.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Tx("Gjentakende hendelse", news(KType.title3, k.ink))
            listOf("this" to "Bare denne", "future" to "Denne og fremtidige", "all" to "Alle").forEach { (sc, n) ->
                Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, k.line, RoundedCornerShape(22.dp)).tap(n) { vm.saveForm44(sc) },
                    contentAlignment = Alignment.Center) { Tx(n, man(KType.callout, FontWeight.Bold, k.ink)) }
            }
            Box(Modifier.fillMaxWidth().height(40.dp).tap("Avbryt") { vm.askScope44 = false }, contentAlignment = Alignment.Center) { Tx("Avbryt", man(KType.subheadline, FontWeight.Bold, k.mut)) }
        }
    }
}

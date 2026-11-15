package no.kristo.kalender.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate as rotateDraw
import androidx.compose.animation.core.animateFloat
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.kalender.Hap
import no.kristo.kalender.KEv
import no.kristo.kalender.Kal41
import no.kristo.kalender.Kal89
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red
import no.kristo.kalender.reduceMotion

/* Svarkortet for søk med Glimt (prompt 41, sAi i Kalender App.dc.html). */

/* ---------------- Søk med Glimt ---------------- */

@Composable
fun GlimtButton41(vm: KalVm) {
    val k = LocalK.current
    val on = vm.k41.aiOn
    Box(Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).background(if (on) Red else k.chip).tap("Søk med Glimt") { vm.k41.aiGo(vm.q) }.padding(horizontal = 11.dp),
        contentAlignment = Alignment.Center) { Tx("✦ Glimt", man(KType.footnote, FontWeight.ExtraBold, if (on) Color.White else k.ink)) }
}

@Composable
fun AiCard41(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    if (!s.aiOn) return
    Column(Modifier.fillMaxWidth().padding(bottom = 6.dp).clip(RoundedCornerShape(18.dp)).background(k.card).border(1.5.dp, Red, RoundedCornerShape(18.dp)).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(18.dp).clip(CircleShape).background(Red), contentAlignment = Alignment.Center) { Tx("✦", man(KType.caption, FontWeight.Bold, Color.White)) }
            Tx("GLIMT · " + if (s.aiLocal) "UTEN AI" else "OLLAMA", mono(KType.caption, Red, .14f))
        }
        if (s.aiBusy) Tx("Leser kalenderen din med Ollama …", man(KType.callout, FontWeight.Medium, k.mut))
        else {
            Tx(s.aiText, man(KType.callout, FontWeight.Medium, k.ink, 21.sp), maxLines = 6)
            s.aiHits.forEach { e ->
                val c = vm.evCal(e)
                Row(Modifier.fillMaxWidth().height(androidx.compose.foundation.layout.IntrinsicSize.Min).tap(e.t) { vm.openEv(e) }.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.width(4.dp).height(34.dp).clip(RoundedCornerShape(2.dp)).background(c.col))
                    Column(Modifier.weight(1f)) {
                        Tx(Kal41.listTitle(e, c.n), man(KType.callout, FontWeight.Bold, k.ink))
                        Tx(no.kristo.kalender.cap(no.kristo.kalender.WD[e.d.dayOfWeek.value % 7]) + " " + e.d.dayOfMonth + ". " + no.kristo.kalender.MN[e.d.monthValue - 1] +
                            if (e.all) " · hele dagen" else " · " + no.kristo.kalender.hm(e.s ?: 0), man(KType.footnote, FontWeight.Medium, k.mut))
                    }
                }
            }
        }
    }
}

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

/* «Send testvarsel» og banneret når det kommer mens appen er åpen (prompt 41, notTest / ntBan). */

/* ---------------- Testvarsel ---------------- */

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TestRow41(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> s.permissionResult(ok) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(k.card).border(1.dp, k.line, RoundedCornerShape(16.dp))
                .combinedClickable(remember { MutableInteractionSource() }, indication = null, onClickLabel = "Send testvarsel", onLongClickLabel = "Send push fra serveren",
                    onLongClick = { s.pushTest() }, onClick = { s.test { runCatching { ask.launch(android.Manifest.permission.POST_NOTIFICATIONS) } } })
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(Red), contentAlignment = Alignment.Center) {
                Svg("M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0", 17.dp, Color.White, 2.2f)
            }
            Column(Modifier.weight(1f)) {
                Tx("Send testvarsel", man(14.5.sp, FontWeight.Bold, k.ink))
                Tx("Kommer om 5 sekunder · lås skjermen for å se det", man(12.5.sp, FontWeight.Medium, k.mut), maxLines = 2)
            }
            Tx("Test", man(13.sp, FontWeight.Bold, Red))
        }
        if (s.denied) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Tx("Varsler er slått av for Kalender", man(13.sp, FontWeight.SemiBold, k.acc), Modifier.weight(1f), maxLines = 2)
            LinePill("Åpne Innstillinger", { s.openNotifSettings() }, h = 32.dp)
        }
        if (s.pushText.isNotEmpty()) Tx(s.pushText, man(12.5.sp, FontWeight.Medium, k.mut), maxLines = 2)
    }
}

/** Banneret når testvarselet kommer mens appen er åpen. */
@Composable
fun TestBanner41(vm: KalVm) {
    if (!vm.k41.banner) return
    Row(
        Modifier.windowInsetsPadding(WindowInsets.statusBars).padding(start = 10.dp, end = 10.dp, top = 6.dp).fillMaxWidth()
            .shadow(16.dp, RoundedCornerShape(22.dp)).clip(RoundedCornerShape(22.dp)).background(Color(0xF5F5F0E6)).tap("Lukk") { vm.k41.banner = false }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.size(36.dp).clip(RoundedCornerShape(9.dp)).background(Color(0xFFFFFDF8)), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.fillMaxWidth().height(11.dp).background(Red))
            Tx("${no.kristo.kalender.today().dayOfMonth}", news(18.sp, Color(0xFF1B1A17), 24.sp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Row { Tx(Kal41.TEST_TITLE, man(12.sp, FontWeight.Bold, Color(0xFF1B1A17)), Modifier.weight(1f)); Tx("nå", man(12.sp, FontWeight.Medium, Color(0xFF6B665C))) }
            Tx("Tannlege kl. 17:30 · om 15 min", man(14.sp, FontWeight.Bold, Color(0xFF1B1A17)))
            Tx("Varsler virker.", man(13.sp, FontWeight.Medium, Color(0xFF3D3A33)))
        }
    }
}

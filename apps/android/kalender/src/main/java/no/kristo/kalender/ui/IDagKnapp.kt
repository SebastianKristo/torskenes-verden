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
import androidx.compose.ui.unit.sp
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

/* «I dag»-ikonet og -knappen i toppfeltet (prompt 44). */

/** 24 × 24: avrundet ramme (6 dp, 1,8 dp strek i tekstfarge), rød topp-stripe 6 dp, dagens tall midtstilt (Manrope 800, 10,5 sp). */
@Composable
fun TodayIcon44(size: Dp = 24.dp) {
    val k = LocalK.current
    val n = today().dayOfMonth
    val f = size.value / 24f
    Column(Modifier.size(size).clip(RoundedCornerShape(6.dp * f)).border(1.8.dp * f, k.ink, RoundedCornerShape(6.dp * f))) {
        Box(Modifier.fillMaxWidth().height(6.dp * f).background(Red))
        Box(Modifier.fillMaxWidth().weight(1f).padding(bottom = 1.dp), contentAlignment = Alignment.Center) {
            Tx("$n", man((10.5f * f).sp, FontWeight.ExtraBold, k.ink))
        }
    }
}

/** Rund «I dag»-knapp (48 dp trykkflate) med ikonet – brukes når det er trangt i toppfeltet. */
@Composable
fun TodayBtn44(onClick: () -> Unit) {
    Box(Modifier.size(48.dp).tap("I dag", onClick = onClick), contentAlignment = Alignment.Center) { TodayIcon44() }
}

package no.kristo.finanshub.ui

import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate

/* ---------------- Subscription OS: rediger og legg til (prompt 14) ---------------- */

private val MONTH_NAMES = listOf("januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember")

/** «Neste trekk 21. oktober, deretter hvert år» ut fra dag, måned og syklus. */
internal fun nextChargeText(day: Int?, month: Int?, cycle: String): String {
    val d = day?.coerceIn(1, 31) ?: return "Velg faktureringsdag"
    val now = LocalDate.now()
    val next: LocalDate = if (cycle == "monthly" || month == null) {
        var x = now.withDayOfMonth(minOf(d, now.lengthOfMonth()))
        if (x.isBefore(now)) { val m = now.plusMonths(1); x = m.withDayOfMonth(minOf(d, m.lengthOfMonth())) }
        x
    } else {
        val m = month.coerceIn(1, 12)
        var x = now.withMonth(m).let { it.withDayOfMonth(minOf(d, it.lengthOfMonth())) }
        if (x.isBefore(now)) x = x.plusYears(1).let { it.withDayOfMonth(minOf(d, it.lengthOfMonth())) }
        x
    }
    val then = when (cycle) { "yearly" -> "hvert år"; "biennial" -> "hvert 2. år"; else -> "hver måned" }
    return "Neste trekk ${next.dayOfMonth}. ${MONTH_NAMES[next.monthValue - 1]}, deretter $then"
}

/** Logoen til et abonnement: egen opplastet / funnet av AI, ellers tjenestens logo fra domenet. */
@Composable
internal fun SubLogo(vm: AppViewModel, s: SubItem?, name: String, size: Int) {
    val url = s?.logoUrl
    var bmp by remember(url) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(url) { bmp = url?.let { vm.subLogo(it) } }
    val b = bmp
    if (b != null) Image(b.asImageBitmap(), name, contentScale = ContentScale.Crop, modifier = Modifier.size(size.dp).clip(RoundedCornerShape((size / 4).dp)))
    else Logo(vm, s?.domain, name.ifBlank { "?" }, 0xFFFF7A3D, size)
}

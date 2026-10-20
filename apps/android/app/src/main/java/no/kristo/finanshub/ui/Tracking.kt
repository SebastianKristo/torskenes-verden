package no.kristo.finanshub.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/* ---------------- Felles ---------------- */

/** Transportørmerket: initialer på merkefargen. */
@Composable
internal fun CarrierBadge(ini: String, color: Long, fg: Long, size: Int = 40, id: String? = null) {
    // Kjente transportører får merket fra serverens SVG (tegnet i CarrierMark); andre får initialer på merkefargen.
    val key = carrierMarkId(id, ini)
    // Prompt 42: PostNord-logoen er pakket med appen (res/drawable/carrier_postnord.xml), aldri blå boks med teksten.
    if (key == "postnord") { PostNordLogo42(size); return }
    if (key != null) { CarrierMark(key, size); return }
    Box(Modifier.size(size.dp).clip(RoundedCornerShape((size * 0.22f).dp)).background(Color(color)), contentAlignment = Alignment.Center) {
        Text(ini, color = Color(fg), fontWeight = FontWeight.Black, fontSize = (size * if (ini.length > 2) 0.28f else 0.36f).sp, maxLines = 1)
    }
}

/* ---------------- Sporing (Homelab-fane) ---------------- */

/* ---------------- Homelab-hjem: karusell med klokke og vær + pakker ---------------- */

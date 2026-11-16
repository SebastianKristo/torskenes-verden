@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package no.kristo.finanshub.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.viewModelScope
import java.net.URLEncoder
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import no.kristo.finanshub.*
import no.kristo.finanshub.family.FamilyService
import no.kristo.finanshub.family.HealthSync
import org.json.JSONObject
import no.kristo.finanshub.ui.designsystem.HomelabType
import no.kristo.finanshub.ui.designsystem.HomelabTheme
import no.kristo.finanshub.ui.designsystem.DsPalette

/*
 * Familie: soneikonene (samme SVG-baner som iOS og web) og sonevarslene (Familie → Soner og Innstillinger → Varsler).
 * Q19: den gamle Familie-siden for servere uten /api/family/people50 (Family22Screen, prompt 22–45) er fjernet. Alle
 * servere fra 5.0 har people50; en eldre server får beskjed om å oppdatere (FamilyPage.kt).
 */

/* ---------------- Ikoner og farger fra designet (ZIC, ZPAL, ZC) ---------------- */

/** Nøkkel, navn og SVG-bane (24 × 24, strek). Samme baner som designet, så iOS og Android blir identiske. */
internal val FAM22_ICONS: List<Triple<String, String, String>> = listOf(
    Triple("home", "Hjem", "M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"),
    Triple("work", "Jobb", "M4 8h16v11H4zM9 8V5h6v3M4 13h16"),
    Triple("school", "Skole", "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5"),
    Triple("heart", "Familie", "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"),
    Triple("cabin", "Hytte", "M3 20h18M5 20V11l7-6 7 6v9M10 20v-5h4v5"),
    Triple("gym", "Trening", "M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"),
    Triple("shop", "Butikk", "M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0"),
    Triple("ball", "Sport", "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18"),
    Triple("coffee", "Kafé", "M5 9h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M11 3v3"),
    Triple("tree", "Natur", "M12 3l6 9h-4l4 6H6l4-6H6zM12 18v3"),
    Triple("plane", "Reise", "M2 13l20-8-6 16-3-7-7-1z"),
    Triple("star", "Favoritt", "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"),
    Triple("pin", "Sted", "M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"),
    // Prompt 42 (claude-code-familie-soner-uten-kart.md): 50 ikoner i alt (ZIC i Familie.dc.html), søkbare med norske ord.
    Triple("car", "Bil", "M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM7 19v1M17 19v1M5 11h14"),
    Triple("bus", "Buss", "M5 4h14v13H5zM5 11h14M8 20v-3M16 20v-3M8 14h.01M16 14h.01"),
    Triple("train", "Tog", "M6 4h12v11H6zM6 10h12M8 19l-2 2M16 19l2 2M9 15h.01M15 15h.01"),
    Triple("bike", "Sykkel", "M6 17a3 3 0 1 0 0-.01M18 17a3 3 0 1 0 0-.01M6 17l4-8h5l3 8M10 9l-1-3H7"),
    Triple("boat", "Båt", "M3 17l2 3h14l2-3zM6 17V10l6-5 6 5v7M12 5v12"),
    Triple("hospital", "Sykehus", "M4 4h16v16H4zM12 8v8M8 12h8"),
    Triple("doctor", "Lege", "M9 3v6a3 3 0 0 0 6 0V3M12 12v3a4 4 0 0 0 8 0v-1M20 13a1 1 0 1 0 0-.01"),
    Triple("pill", "Apotek", "M8 4h8a4 4 0 0 1 0 8H8a4 4 0 0 1 0-8zM12 4v8M7 16h10M9 20h6"),
    Triple("church", "Kirke", "M12 2v4M10 4h4M6 21V11l6-4 6 4v10M10 21v-5h4v5"),
    Triple("book", "Bibliotek", "M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z"),
    Triple("music", "Musikk", "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"),
    Triple("film", "Kino", "M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4"),
    Triple("food", "Restaurant", "M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-2 6 0 8v10"),
    Triple("cart", "Matbutikk", "M3 4h2l2 11h11l2-8H6M9 20a1 1 0 1 0 0-.01M17 20a1 1 0 1 0 0-.01"),
    Triple("fuel", "Bensin", "M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M6 9h6M14 10h2a2 2 0 0 1 2 2v5a1 1 0 0 0 2 0V8l-3-3"),
    Triple("bolt", "Lading", "M13 2L4 14h7l-1 8 9-12h-7z"),
    Triple("paw", "Dyr", "M12 14c-3 0-5 2.5-5 4.5S9 21 12 21s5-.5 5-2.5S15 14 12 14zM6 10a2 2 0 1 0 0-.01M18 10a2 2 0 1 0 0-.01M9 6a2 2 0 1 0 0-.01M15 6a2 2 0 1 0 0-.01"),
    Triple("baby", "Barnehage", "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM6 21v-3a6 6 0 0 1 12 0v3M10 7h.01M14 7h.01"),
    Triple("swim", "Svømmehall", "M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M6 14l4-6 4 3 3-4M17 5a1.5 1.5 0 1 0 0-.01"),
    Triple("ski", "Ski", "M4 20L20 4M8 20L20 8M14 4a2 2 0 1 0 0-.01"),
    Triple("tent", "Camping", "M3 20L12 4l9 16zM12 4v16M9 20l3-6 3 6"),
    Triple("mountain", "Fjell", "M3 20l6-11 4 6 2-3 6 8zM9 9l2 4"),
    Triple("beach", "Strand", "M3 20h18M12 20c0-6 2-10 7-12M12 20c0-6-2-10-7-12M12 8c-3-3-6-3-8-2M12 8c3-3 6-3 8-2"),
    Triple("sun", "Sol", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"),
    Triple("gift", "Gave", "M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0"),
    Triple("cake", "Bursdag", "M4 21h16v-8H4zM4 16c2 1 4 1 6 0s4-1 6 0 4 1 4 0M12 9v4M12 5a1 1 0 0 0 0 2"),
    Triple("game", "Spill", "M6 9h12a4 4 0 0 1 0 8l-2-2H8l-2 2a4 4 0 0 1 0-8zM8 11v3M6.5 12.5h3M15 12h.01M17 14h.01"),
    Triple("laptop", "Kontor", "M4 5h16v11H4zM2 19h20"),
    Triple("tool", "Verksted", "M14 7a4 4 0 0 0-5 5l-6 6 3 3 6-6a4 4 0 0 0 5-5l-2 2-2-1-1-2z"),
    Triple("key", "Utleie", "M15 9a4 4 0 1 0-4 4l-8 8M9 17l2 2M12 14l2 2"),
    Triple("bed", "Hotell", "M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3M7 11a1.5 1.5 0 1 0 0-.01"),
    Triple("flag", "Mål", "M5 21V4M5 4h11l-2 4 2 4H5"),
    Triple("bell", "Varsel", "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"),
    Triple("camera", "Foto", "M4 8h4l2-3h4l2 3h4v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"),
    Triple("anchor", "Havn", "M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 8v13M5 13a7 7 0 0 0 14 0M9 11h6"),
    Triple("leaf", "Hage", "M5 19C5 10 10 5 20 4c-1 10-6 15-15 15zM5 19l7-7"),
)

internal fun fam22IconPath(key: String): String = FAM22_ICONS.firstOrNull { it.first == key }?.third
    ?: (if (key.startsWith("ify:")) Ify42.paths[key] else null) ?: FAM22_ICONS.first { it.first == "pin" }.third

/**
 * Prompt 45 (claude-code-sonevarsler-ikon-bryter.md): «Posisjonsvarsler» øverst i Familie → Soner – hovedbryter og bryter per person
 * (bilde/initialer). Hovedbryter av → personbryterne grå. «Vis eksempel på varsel» sender et ekte systemvarsel med soneikonet.
 * Eldre server (404): kortet vises ikke.
 */
@Composable
internal fun ZoneAlertsCard45(vm: AppViewModel) {
    val p = HomelabTheme.colors
    androidx.compose.runtime.LaunchedEffect(vm.account?.id) { vm.loadZoneAlerts45() }
    val z = vm.p45.zoneAlerts ?: return
    PCard {
        PToggle("Posisjonsvarsler", "Varsle når noen kommer til eller forlater en sone", z.on) { vm.setZoneAlert45(null, it) }
        z.people.forEach { m ->
            Row(
                Modifier.fillMaxWidth().padding(start = 14.dp, end = 4.dp).alpha(if (z.on) 1f else .45f),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(Modifier.size(30.dp).clip(androidx.compose.foundation.shape.CircleShape).background(m.color?.let { Color(it) } ?: p.textTertiary), contentAlignment = Alignment.Center) {
                    Text(m.initials.take(2), color = Color.White, fontWeight = FontWeight.Bold, fontSize = HomelabType.caption.fontSize, maxLines = 1)
                }
                Box(Modifier.weight(1f)) { PToggle(m.name, null, m.on && z.on, top = false) { if (z.on) vm.setZoneAlert45(m.id, it) } }
            }
        }
        Text(
            "Vis eksempel på varsel", color = p.accent, fontWeight = FontWeight.Bold, fontSize = HomelabType.subheadline.fontSize,
            modifier = Modifier.fillMaxWidth().clickable(role = androidx.compose.ui.semantics.Role.Button) { Haptics.tap(); vm.sampleZoneNotify45() }.padding(14.dp, 12.dp),
        )
    }
}

/** Innstillinger → Varsler: hovedbryteren for sonevarsler (samme valg som Familie → Soner → Posisjonsvarsler). */
@Composable
internal fun ZoneAlertsToggle45(vm: AppViewModel) {
    androidx.compose.runtime.LaunchedEffect(vm.account?.id) { vm.loadZoneAlerts45() }
    val z = vm.p45.zoneAlerts ?: return
    val off = z.people.count { !it.on }
    PToggle("Sonevarsler", if (!z.on) "Av" else if (off > 0) "På · $off ${if (off == 1) "person" else "personer"} av (Familie → Soner)" else "Når noen i familien kommer eller går", z.on, top = true) { vm.setZoneAlert45(null, it) }
}

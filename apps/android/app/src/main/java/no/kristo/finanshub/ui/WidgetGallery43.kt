package no.kristo.finanshub.ui

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/*
 * Prompt 43 (claude-code-widget-galleri.md, Widget Galleri.dc.html platform="android"/samsung): Innstillinger → App → Widgets.
 * Alle widgetene appen har, gruppert (Media · Avganger · Kalender · Prøveperioder · Pakker · Glimt-brief · Andre), med størrelse og
 * «Legg til på startskjermen» → AppWidgetManager.requestPinAppWidget (systemdialogen). Sjekker isRequestPinAppWidgetSupported først;
 * ellers vises stegene. «✓ Lagt til» leses fra getAppWidgetIds(provider) og oppdateres mens siden er åpen.
 * På Samsung vises One UI-variantene (de er slått av på andre telefoner).
 */

private data class WDef43(val group: String, val name: String, val size: String, val cls: String, val samsung: Boolean = false)

private val WIDGETS43 = listOf(
    WDef43("Media", "Media", "2 × 2", "MediaSmallReceiver"), WDef43("Media", "Media · Pause alt", "4 × 2", "MediaMediumReceiver"),
    WDef43("Media", "Media · Kommer denne uka", "4 × 3", "MediaLargeReceiver"),
    WDef43("Avganger", "Ruter", "2 × 2", "RuterReceiver27S"), WDef43("Avganger", "Ruter", "4 × 2", "RuterReceiver27M"), WDef43("Avganger", "Ruter-stripe", "4 × 1", "RuterReceiver27Strip"),
    WDef43("Avganger", "Ruter · Samsung", "2 × 2", "S27RuterSmallReceiver", true), WDef43("Avganger", "Ruter · Samsung", "4 × 2", "S27RuterWideReceiver", true),
    WDef43("Avganger", "Ruter-stabel · Samsung", "4 × 2", "S27RuterStackReceiver", true),
    WDef43("Kalender", "Kalender", "2 × 2", "KalReceiver26S"), WDef43("Kalender", "Kalender", "4 × 2", "KalReceiver26M"), WDef43("Kalender", "Kalender", "4 × 4", "KalReceiver26L"),
    WDef43("Kalender", "Kalender · Samsung", "2 × 2", "S24KalReceiver26S", true), WDef43("Kalender", "Kalender · Samsung", "4 × 2", "S24KalReceiver26M", true),
    WDef43("Kalender", "Kalender · Samsung", "4 × 4", "S24KalReceiver26L", true),
    WDef43("Prøveperioder", "Prøveperioder", "2 × 2", "TrialsReceiver32bS"), WDef43("Prøveperioder", "Prøveperioder", "4 × 2", "TrialsReceiver32bM"),
    WDef43("Prøveperioder", "Prøveperioder · Samsung", "2 × 2", "S32bTrialsSmallReceiver", true), WDef43("Prøveperioder", "Prøveperioder · Samsung", "4 × 2", "S32bTrialsWideReceiver", true),
    WDef43("Pakker", "Pakker", "4 × 2", "PackagesReceiver"), WDef43("Pakker", "Sporing · Samsung", "2 × 2", "S24PackagesReceiver", true),
    WDef43("Glimt-brief", "Glimt-brief", "4 × 2", "BriefReceiver34"), WDef43("Glimt-brief", "Glimt-brief · Samsung", "2 × 2", "S35Brief22Receiver", true),
    WDef43("Glimt-brief", "Glimt-brief · Samsung", "4 × 1", "S35Brief41Receiver", true), WDef43("Glimt-brief", "Glimt-brief · Samsung", "4 × 4", "S35Brief44Receiver", true),
    WDef43("Andre", "Vær", "4 × 2", "WeatherReceiver"), WDef43("Andre", "Gjøremål", "4 × 2", "TasksReceiver"), WDef43("Andre", "Bursdager", "4 × 2", "BirthdaysReceiver24"),
    WDef43("Andre", "Budsjett", "4 × 2", "BudgetReceiver"), WDef43("Andre", "Finans", "4 × 2", "FinanceReceiver"), WDef43("Andre", "Skann", "1 × 1", "ScanReceiver"),
    WDef43("Andre", "Bibelvers", "4 × 2", "Bible37Receiver"), WDef43("Andre", "Hjemlys", "4 × 2", "HjemlysStart40Receiver"),
)

private fun comp43(ctx: Context, cls: String) = ComponentName(ctx.packageName, "no.kristo.finanshub.widget.$cls")

private fun count43(ctx: Context, cls: String): Int = runCatching { AppWidgetManager.getInstance(ctx).getAppWidgetIds(comp43(ctx, cls)).size }.getOrDefault(0)

private fun enabled43(ctx: Context, cls: String): Boolean = runCatching {
    val st = ctx.packageManager.getComponentEnabledSetting(comp43(ctx, cls))
    st != android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED &&
        (st != android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DEFAULT || ctx.packageManager.getReceiverInfo(comp43(ctx, cls), 0).enabled)
}.getOrDefault(false)

@Composable
internal fun WidgetGallery43(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val s = vm.p43
    BackHandler { s.galleryOpen = false }
    val samsung = Build.MANUFACTURER.equals("samsung", ignoreCase = true)
    val mgr = remember { AppWidgetManager.getInstance(ctx) }
    val canPin = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && runCatching { mgr.isRequestPinAppWidgetSupported }.getOrDefault(false)
    var filter by remember { mutableStateOf("Alle") }
    var tick by remember { mutableIntStateOf(0) }
    var asked by remember { mutableStateOf<String?>(null) }
    // Systemdialogen gir ingen tilbakemelding vi venter på her; tellingen leses på nytt hvert 1,5 s mens siden er åpen.
    LaunchedEffect(Unit) { while (true) { delay(1500); tick++ } }
    val list = WIDGETS43.filter { (samsung || !it.samsung) && enabled43(ctx, it.cls) }
    val groups = listOf("Alle") + list.map { it.group }.distinct()
    val navB = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    Box(Modifier.fillMaxSize().background(p.bg)) {
        LazyColumn(Modifier.fillMaxSize().statusBarsPadding(), contentPadding = PaddingValues(16.dp, 6.dp, 16.dp, 28.dp + navB), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                Text("‹ Innstillinger", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp,
                    modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape).clickable(role = Role.Button) { s.galleryOpen = false }.wrapContentHeight())
                PSerif("Widgets", 34.sp, maxLines = 1)
                Text(if (canPin) "Trykk «Legg til på startskjermen», så spør telefonen hvor den skal ligge." + if (samsung) " One UI-variantene er med." else ""
                    else "Hold inne på startskjermen → Widgets → søk «${vm.appName}» → velg størrelse og dra den på plass.", color = p.mut, fontSize = 13.sp, lineHeight = 18.sp)
            }
            item {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    groups.forEach { g ->
                        Box(Modifier.heightIn(min = 44.dp).clickable { filter = g }, contentAlignment = Alignment.Center) {
                            Text(g, color = if (filter == g) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                                modifier = Modifier.clip(CircleShape).background(if (filter == g) p.ink else p.card).border(1.dp, if (filter == g) p.ink else p.line, CircleShape).padding(14.dp, 8.dp))
                        }
                    }
                }
            }
            list.filter { filter == "Alle" || it.group == filter }.groupBy { it.group }.forEach { (g, ws) ->
                item(key = "g-$g") { PLabel(g, modifier = Modifier.padding(top = 6.dp)) }
                ws.forEach { w ->
                    item(key = "w-" + w.cls) {
                        val n = remember(tick, w.cls) { count43(ctx, w.cls) }
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(12.dp), verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            // Forhåndsvisningen: Material You-flate (eller Samsung-blå) med navn og størrelse.
                            val bg = if (w.samsung) Brush.linearGradient(listOf(Color(0xFF1F6FE5), Color(0xFF5B9BFF))) else Brush.linearGradient(listOf(Color(0xFFD8E2FF), Color(0xFFB9C8F5)))
                            Box(Modifier.size(width = if (w.size.startsWith("4")) 92.dp else 56.dp, height = 56.dp).clip(RoundedCornerShape(16.dp)).background(bg).padding(8.dp)) {
                                Text(w.group, color = if (w.samsung) Color.White else Color(0xFF1B2A55), fontWeight = FontWeight.Bold, fontSize = 10.sp, maxLines = 2)
                            }
                            Column(Modifier.weight(1f)) {
                                Text(w.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 2)
                                Text(w.size + if (n > 0) " · ✓ Lagt til" + (if (n > 1) " ($n)" else "") else "", color = if (n > 0) p.pos else p.mut, fontSize = 12.sp)
                            }
                            if (canPin) Box(
                                Modifier.heightIn(min = 44.dp).clip(CircleShape).background(p.ink).clickable(role = Role.Button, onClickLabel = "Legg til ${w.name} på startskjermen") {
                                    Haptics.tap()
                                    asked = w.cls
                                    runCatching { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) mgr.requestPinAppWidget(comp43(ctx, w.cls), null, null) }
                                }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center,
                            ) { Text(if (asked == w.cls && n == 0) "Venter …" else "Legg til", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 12.5.sp) }
                        }
                    }
                }
            }
        }
    }
}

package no.kristo.finanshub.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.ViewWeek
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/* ---------------- Små byggeklosser ---------------- */

internal val NB16: java.util.Locale = java.util.Locale.forLanguageTag("nb-NO")

/** Tekst som krymper til den får plass på én linje, i stedet for å kuttes eller få «…». */
@Composable
internal fun FitText(text: String, color: Color, size: TextUnit, weight: FontWeight = FontWeight.Normal, modifier: Modifier = Modifier, family: FontFamily? = null, min: TextUnit = 9.sp) {
    var s by remember(text, size) { mutableStateOf(size) }
    Text(
        text, color = color, fontSize = s, fontWeight = weight, fontFamily = family, maxLines = 1, softWrap = false, modifier = modifier,
        onTextLayout = { r -> if (r.hasVisualOverflow && s.value > min.value) s = (s.value * 0.92f).sp },
    )
}

/** Googles «G»: de offisielle fire banene (48×48 viewBox), ikke tegnet på nytt. */
private val googleGPaths: List<Pair<Long, String>> = listOf(
    0xFFEA4335 to "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z",
    0xFF4285F4 to "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z",
    0xFFFBBC05 to "M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z",
    0xFF34A853 to "M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z",
)

@Composable
internal fun GoogleG(size: Dp = 18.dp) {
    val paths = remember { googleGPaths.map { (c, d) -> Color(c) to PathParser().parsePathString(d).toPath() } }
    Canvas(Modifier.size(size)) {
        val k = this.size.minDimension / 48f
        scale(k, k, pivot = Offset.Zero) { paths.forEach { (c, p) -> drawPath(p, c) } }
    }
}

/** Ikon i farget rute (Innstillinger). Fargen følger fargetemaet brukeren har valgt. */
@Composable
internal fun IconTile(vm: AppViewModel, i: Int, icon: ImageVector, fixed: Long? = null) {
    val pal = iconPalette(vm.iconTheme)
    // Prompt 30: faste farger som på web for de kjente radene (setColor30), ellers fargetemaet.
    val c = Color(fixed ?: pal[((i % pal.size) + pal.size) % pal.size])
    Box(Modifier.size(32.dp).clip(RoundedCornerShape(9.dp)).background(c), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(18.dp))
    }
}

/** Rad i Innstillinger med farget ikon, tittel, undertekst og verdi. */
@Composable
internal fun SetRow(vm: AppViewModel, i: Int, icon: ImageVector, title: String, sub: String?, value: String = "›", top: Boolean = false, onClick: () -> Unit) {
    val p = PaperPal.current
    Column {
        if (top) Box(Modifier.fillMaxWidth().padding(start = 60.dp).height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().hl25(vm, rowKey25(title)).clickable(onClick = onClick).padding(14.dp, 11.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            IconTile(vm, i, icon, setColor30(title))
            Column(Modifier.weight(1f)) {
                Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (!sub.isNullOrBlank()) Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Text(value, color = p.mut, fontSize = 13.sp, maxLines = 1)
        }
    }
}

/* ---------------- Innstillinger i Papir ---------------- */

/**
 * Innstillinger i Papir-stil: Profil øverst (trykk på profilbildet åpner hit), Utseende (tema, ikonfarger og bakgrunn,
 * som før lå i «Oslo ▾» på Hjem), Fanelinje, Moduler (Familie, Avganger, Vær, Nyhetsleser) og Konto.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun PaperSettings16(vm: AppViewModel, navBottom: Dp, head: (androidx.compose.foundation.lazy.LazyListScope.() -> Unit)? = null) {
    // Innstillinger → Utseende og fanelinje: tema, ikonfarger, bakgrunn på Hjem og fanelinjen.
    val p = PaperPal.current
    val own = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let(vm::uploadPhoto) }
    LaunchedEffect(Unit) { vm.loadPhotoThumbs() }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        head?.invoke(this) // Prompt 39: Tilpass – IDENTITET og FANELINJE øverst (ui/Settings39.kt)
        item { PLabel(if (head != null) "Tema" else "Utseende", modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
        item {
            PCard(Modifier.hl34(vm, "theme")) { // prompt 34: mål «theme»
                val sel = "✓"
                SetRow(vm, 0, Icons.Filled.Palette, "Papir · lys", "Lyst papir og svart fanelinje", if (vm.paperMode == "lys" && !Theme51.auto) sel else "") { vm.setPaperMode("lys") }
                SetRow(vm, 1, Icons.Filled.Palette, "Papir · mørk", "Kveldspapir og lys fanelinje", if (vm.paperMode == "mork" && !Theme51.auto) sel else "", top = true) { vm.setPaperMode("mork") }
                SetRow(vm, 2, Icons.Filled.Palette, "Følg systemet", "Lys om dagen, mørk når telefonen er mørk", if (vm.paperMode == "auto" && !Theme51.auto) sel else "", top = true) { vm.setPaperMode("auto") }
                // Prompt 50: Liquid Glass slår også på fliser på Hjem (ui/Glass50.kt).
                SetRow(vm, 3, Icons.Filled.Palette, "Liquid Glass", "Mørkt glass, fargeskyer og fliser på Hjem", if (vm.paperMode == "glass") sel else "", top = true) { vm.setGlass50() }
                // Prompt 51 (ANDFEAT51): automatisk tema (etter solen / klokkeslett) og synk mellom enheter (ui/Theme51Ui.kt).
                SetRow(vm, 4, Icons.Filled.Palette, "Automatisk tema", if (Theme51.auto) (if (Theme51.by == "time") "Etter klokkeslett · på alle enheter" else "Etter solnedgang · på alle enheter") else "Etter solnedgang eller klokkeslett, på alle enheter", if (Theme51.auto) sel else "›", top = true) { vm.open51("tema") }
            }
        }
        item { PCard { PToggle("Hjem som fliser", "Avgang, Finans, Middag, Familie og Domener som fliser", vm.homeTiles50()) { vm.setPref(HOME_TILES50, it) } } } // prompt 50
        item { LookExtras42(vm) } // Prompt 42: personvern og widget-valgene fra den slettede klassiske Utseende-siden
        item { PLabel("Ikonfarger", modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
        item {
            PCard {
                FlowRow(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ICON_THEMES.forEach { (k, n) ->
                        val on = vm.iconTheme == k
                        Row(
                            Modifier.clip(RoundedCornerShape(14.dp)).border(if (on) 2.dp else 1.dp, if (on) p.ink else p.line, RoundedCornerShape(14.dp))
                                .clickable { Haptics.select(); vm.updateIconTheme(k) }.padding(10.dp, 8.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            iconPalette(k).take(4).forEach { c -> Box(Modifier.size(12.dp).clip(CircleShape).background(Color(c))) }
                            Text(n + if (on) " ✓" else "", color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
        item { PLabel("Bakgrunn på Hjem", modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
        item { Box(Modifier.hl34(vm, "bg")) { PaperBgSettings(vm) { own.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) } } } // prompt 34: mål «bg»
        item { Column(verticalArrangement = Arrangement.spacedBy(2.dp)) { BgCredit41(vm) } } // Prompt 41: kreditering for valgt bakgrunn (ikke på Hjem)
        item { PLabel(if (head != null) "Fanelinje · flere valg" else "Fanelinje", modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
        item {
            PCard {
                ScanHomeRow41(vm) // Prompt 41
                SetRow(vm, 1, Icons.Filled.ViewWeek, "Rediger fanelinjen", "Fjern faner, gi nytt navn og bytt ikon. Du kan også holde inne på linjen.", "›", top = true) { vm.tabEdit = true }
            }
        }
        item { SecNavSettings32b(vm) } // Prompt 32: FANELINJE · ANDRE SIDER (Domener, Abonnement, Familie)
        item { Column(verticalArrangement = Arrangement.spacedBy(6.dp)) { PaperNavSettings(vm) } }
    }
}

/* ---------------- Fanelinja: rediger (hold inne på linja eller via Innstillinger) ---------------- */

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun TabBarEditor(vm: AppViewModel) {
    // Prompt 32: samme ark som Finans, Domener, Abonnement og Familie (claude-code-fanelinje-ark-knapper.md): HJEM · FANELINJE,
    // Ferdig som Papir-pille, ingen Avbryt (lagres når arket lukkes), ↑ og −, STIL · FORHÅNDSVISNING og LEGG TIL. «Mer» står alltid sist.
    val mer = vm.tabBarItems().firstOrNull { it.id == "mer" } ?: MAIN_TABS.first { it.id == "mer" }
    fun cur() = vm.tabBarItems().filter { it.id != "mer" }.map { NavEd32b(it.id, it.label, it.icon) }
    NavEditor32b(
        vm, "Hjem", cur(), MAIN_TABS.filter { it.id != "mer" && (it.id != "bibel" || vm.bibleAllowed37()) }.map { NavEd32b(it.id, it.label, it.icon) }, 5, mer = true, icons = TAB_ICONS,
        onSave = { l -> vm.saveTabBar(l.map { TabItem(it.key, it.label, it.icon) } + mer) },
        onReset = { vm.resetTabBar(); cur() },
        onClose = { vm.tabEdit = false },
    )
}

/* ---------------- Vær: egne steder ---------------- */

/* ---------------- Avganger: egen side i nyhetsleser-stil ---------------- */

/* ---------------- Boliger i Papir ---------------- */

package no.kristo.finanshub.ui

import android.graphics.Bitmap
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import java.time.LocalTime
import java.time.format.DateTimeFormatter

/** Widgets på forsiden: navn, beskrivelse og ikon (galleriet «Legg til widget»). */
private val WIDGETS: Map<String, Triple<String, String, ImageVector>> = mapOf(
    "clock" to Triple("Klokke og vær", "Tid, været og pakker på vei (sveip)", Icons.Filled.Schedule),
    "search" to Triple("Google-søk", "Søk med forslag og historikk", Icons.Filled.Search),
    "links" to Triple("Snarveier", "Favorittsider og tjenester på hjemmenettet", Icons.Filled.Apps),
    "os" to Triple("Andre OS", "Finans, Domener og Mat", Icons.Filled.Widgets),
    "srv" to Triple("Serverstatus", "CPU, minne, lagring og oppetid", Icons.Filled.Dns),
    "ruter" to Triple("Ruter-avganger", "Neste avganger fra holdeplassen", Icons.Filled.DirectionsBus),
)
private val HL_NAMES = mapOf("hl" to "Homelab", "home" to "Finans", "trk" to "Sporing", "dom" to "Domener", "mat" to "Mat")
private val FIN_NAMES = mapOf("home" to "Oversikt", "list" to "Liste", "finn" to "Finn", "bud" to "Budsjett", "ai" to "Søk", "mer" to "Mer")

@Composable
private fun SmallRound(text: String, enabled: Boolean, onClick: () -> Unit) {
    Box(Modifier.size(30.dp).clip(CircleShape).background(if (enabled) C.surface3 else C.surface2).clickable(enabled = enabled, onClick = onClick), contentAlignment = Alignment.Center) {
        Text(text, color = if (enabled) C.text else C.text2.copy(alpha = .4f), fontSize = 12.sp)
    }
}

/* ---------------- Seksjonene ---------------- */

/* ---------------- Legg til widget og fanelinjer ---------------- */

/** Fanenavn som kan endres. Lagres når feltet mister fokus, ved «Ferdig» og når arket lukkes. */
@Composable
private fun TabNameField(vm: AppViewModel, key: String, default: String, on: Boolean, modifier: Modifier) {
    val saved = vm.layout.names[key] ?: ""
    var text by remember(key, saved) { mutableStateOf(saved) }
    val focus = LocalFocusManager.current
    val latest by rememberUpdatedState(text)
    fun save(v: String) { if (v.trim() != saved) vm.rename(key, v) }
    DisposableEffect(key) { onDispose { if (latest.trim() != (vm.layout.names[key] ?: "")) vm.rename(key, latest) } }
    androidx.compose.foundation.text.BasicTextField(
        text, { text = it.take(30) }, singleLine = true,
        textStyle = androidx.compose.ui.text.TextStyle(color = if (on) C.text else C.text2, fontSize = 15.sp),
        cursorBrush = androidx.compose.ui.graphics.SolidColor(C.primary),
        keyboardOptions = KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { save(text); focus.clearFocus() }),
        modifier = modifier.onFocusChanged { if (!it.isFocused) save(text) }.padding(vertical = 8.dp),
        decorationBox = { inner -> Box { if (text.isEmpty()) Text(default, color = if (on) C.text else C.text2, fontSize = 15.sp); inner() } },
    )
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun WidgetGallery(vm: AppViewModel) {
    ModalBottomSheet(onDismissRequest = { vm.widgetGallery = false }, containerColor = C.surface1) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp, 0.dp, 20.dp, 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Legg til widget", style = MaterialTheme.typography.titleLarge)
            HomeLayout.SECTIONS.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { id ->
                        val (name, desc, icon) = WIDGETS.getValue(id)
                        val shown = vm.layout.visible(id)
                        Column(Modifier.weight(1f).clip(RoundedCornerShape(24.dp)).background(C.surface2).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Icon(icon, null, tint = C.primary)
                            Text(name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(desc, color = C.text2, fontSize = 12.sp, maxLines = 2, minLines = 2, overflow = TextOverflow.Ellipsis)
                            Button(onClick = { vm.setHidden(id, false) }, enabled = !shown, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text(if (shown) "Lagt til" else "Legg til") }
                        }
                    }
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                }
            }
            NavEditors(vm)
            OutlinedButton(onClick = { vm.resetLayout() }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp)) { Text("Tilbakestill") }
        }
    }
}

/** Navigasjonslinjene i Homelab og Finans: nytt navn (tomt = standard), rekkefølge og skjul. */
@Composable
internal fun NavEditors(vm: AppViewModel) {
    NavEditor(vm, "Navigasjon · Homelab", "hlTabs", "hl.", vm.layout.hlTabs, HL_NAMES, HomeLayout.FIXED_HL)
    NavEditor(vm, "Navigasjon · Finans", "finTabs", "fin.", vm.layout.finTabs, FIN_NAMES, HomeLayout.FIXED_FIN)
    Text("Trykk på et navn for å endre det. Tomt felt gir standardnavnet.", color = C.text2, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 8.dp))
}

@Composable
private fun NavEditor(vm: AppViewModel, title: String, key: String, prefix: String, ids: List<String>, names: Map<String, String>, fixed: Set<String>) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        SectionLabel(title)
        ids.forEachIndexed { i, id ->
            val on = id in fixed || vm.layout.visible(id)
            Row(Modifier.fillMaxWidth().clip(itemShape(i, ids.size)).background(C.surface2).padding(16.dp, 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${i + 1}", color = C.text2, fontFamily = Mono, fontSize = 13.sp)
                TabNameField(vm, prefix + id, names[id] ?: id, on, Modifier.weight(1f))
                SmallRound("▲", enabled = i > 0) { vm.move(key, id, -1) }
                SmallRound("▼", enabled = i < ids.size - 1) { vm.move(key, id, 1) }
                if (id in fixed) Text("Alltid", color = C.text2, fontSize = 12.sp, modifier = Modifier.padding(start = 6.dp))
                else Switch(checked = on, onCheckedChange = { vm.setHidden(id, !it) }, colors = SwitchDefaults.colors(checkedTrackColor = C.primary, checkedThumbColor = C.onPrimary))
            }
        }
    }
}

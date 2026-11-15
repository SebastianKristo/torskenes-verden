package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/* ======================= Tilpass: personvern og widgets (fra den slettede klassiske Utseende-siden) ======================= */

/** «Skjul beløp til jeg trykker», widget-stil (One UI) og låseskjerm-widgetene. Lå bare i Material You-«Klassisk» før prompt 42. */
@Composable
internal fun LookExtras42(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Personvern", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            PToggle("Skjul beløp til jeg trykker", "Beløp vises som prikker til du trykker på saldoen eller øyet", vm.flag(AppPrefs.HIDE_AMOUNTS)) { vm.setPref(AppPrefs.HIDE_AMOUNTS, it) }
        }
        PLabel("Widgets · One UI-stil", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            var alpha by remember { mutableStateOf(vm.optionInt(AppPrefs.W_ALPHA, 75).toFloat()) }
            Row(Modifier.fillMaxWidth().padding(12.dp, 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("system" to "Som systemet", "dark" to "Mørk", "light" to "Lys").forEach { (k, n) ->
                    val on = vm.option(AppPrefs.W_THEME, "system") == k
                    Box(Modifier.weight(1f).height(38.dp).clip(CircleShape).background(if (on) p.ink else Color.Transparent).border(1.dp, if (on) p.ink else p.line, CircleShape)
                        .clickable(role = Role.RadioButton) { vm.setPref(AppPrefs.W_THEME, k); no.kristo.finanshub.widget.WidgetSync.styleChanged(ctx) }, contentAlignment = Alignment.Center) {
                        Text(n, color = if (on) p.bg else p.ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    }
                }
            }
            Column(Modifier.fillMaxWidth().padding(14.dp, 0.dp, 14.dp, 10.dp)) {
                Row { Text("Bakgrunn", color = p.ink, fontSize = 14.sp, modifier = Modifier.weight(1f)); Text("${alpha.toInt()} %", color = p.mut, fontSize = 13.sp) }
                Slider(value = alpha, onValueChange = { alpha = it }, valueRange = 0f..100f, steps = 9,
                    onValueChangeFinished = { vm.setPref(AppPrefs.W_ALPHA, alpha.toInt()); no.kristo.finanshub.widget.WidgetSync.styleChanged(ctx) },
                    colors = SliderDefaults.colors(thumbColor = p.ink, activeTrackColor = p.ink, inactiveTrackColor = p.line))
            }
        }
        Text("Gjelder Samsung-widgetene (Søk, Klokke, Vær, Pakker, Skann, Budsjett, Aksjer, Middag, Økonomi, Domener og Finn).",
            color = p.mut, fontSize = 12.sp, lineHeight = 16.sp, modifier = Modifier.padding(horizontal = 6.dp))
        PLabel("Widgets · låseskjerm", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            var hide by remember { mutableStateOf(no.kristo.finanshub.widget.Lock40.hide(ctx)) }
            PToggle("Skjul beløp og navn på låseskjermen", "Budsjett og Pakker viser «•••» til telefonen er låst opp", hide) { hide = it; no.kristo.finanshub.widget.Lock40.setHide(ctx, it) }
        }
    }
}

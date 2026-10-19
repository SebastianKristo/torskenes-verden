package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 29 (ANDROID29): søkefeltet øverst på Hjem (Mobil Papir App → Hjem, claude-code-hjem-sok-ai.md).
 * Ikonet til venstre (med ▾) åpner «SØK MED»: System-AI (standard, svarer i Chat og legger til timer), Google og DuckDuckGo.
 * Menyen er en DropdownMenu (eget Popup-lag), så den ligger alltid over kortene. Timer gjenkjennes uansett søkemotor
 * (POST /api/kalender/quick/parse, lokal reserve) og legges til i bakgrunnen. ✦ AI til høyre åpner alltid Chat.
 */

private const val H29_CAL = "M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4"
private const val H29_CHEV = "M6 9l6 6 6-6"
private const val H29_CHECK = "M5 12.5l4.5 4.5L19 7"
private const val H29_X = "M6 6l12 12M18 6L6 18"
private val DDG29 = Color(0xFFDE5833)

private fun placeholder29(e: String) = when (e) { "google" -> "Søk på Google"; "ddg" -> "Søk med DuckDuckGo"; else -> "Spør AI eller skriv «time hos …»" }

@Composable
private fun EngineIcon29(e: String, size: Dp) {
    val p = PaperPal.current
    when (e) {
        "google" -> GoogleG(size)
        "ddg" -> Box(Modifier.size(size).clip(CircleShape).background(DDG29), contentAlignment = Alignment.Center) {
            Text("D", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = (size.value * .55f).sp)
        }
        else -> Box(Modifier.size(size).clip(CircleShape).background(p.lab), contentAlignment = Alignment.Center) {
            Text("✦", color = p.onLab, fontSize = (size.value * .55f).sp)
        }
    }
}

@Composable
internal fun PaperSearch29(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val fm = LocalFocusManager.current
    val q = vm.q29
    val text = q.homeQ
    val go: () -> Unit = {
        fm.clearFocus()
        vm.goHome29()?.let { openLink(ctx, it) }
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            Modifier.fillMaxWidth().height(46.dp).shadow(12.dp, CircleShape).clip(CircleShape).background(p.card).padding(start = 8.dp, end = 6.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box {
                Row(
                    Modifier.height(34.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Velg søkemotor") { Haptics.select(); q.engineMenu = !q.engineMenu }
                        .padding(start = 8.dp, end = 6.dp).semantics { contentDescription = "Velg søkemotor" },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    EngineIcon29(q.engine, if (q.engine == "google") 18.dp else 20.dp)
                    WxIcon(H29_CHEV, p.mut, 10.dp, stroke = 3f)
                }
                EngineMenu29(vm)
            }
            BasicTextField(
                text, { vm.setHomeQuery29(it) }, singleLine = true,
                textStyle = TextStyle(color = p.ink, fontSize = 14.5.sp, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans),
                cursorBrush = SolidColor(p.lab),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = { go() }, onSearch = { go() }, onDone = { go() }),
                modifier = Modifier.weight(1f),
                decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (text.isEmpty()) Text(placeholder29(q.engine), color = p.mut, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis); inner() } },
            )
            if (text.isNotEmpty()) Box(
                Modifier.size(30.dp).clip(CircleShape).background(p.line).clickable(role = Role.Button, onClickLabel = "Tøm") { vm.setHomeQuery29("") },
                contentAlignment = Alignment.Center,
            ) { WxIcon(H29_X, p.ink, 11.dp, stroke = 3.2f) }
            Box(
                Modifier.height(34.dp).clip(CircleShape).background(p.bg)
                    .clickable(role = Role.Button, onClickLabel = "Åpne Chat") { Haptics.select(); fm.clearFocus(); vm.openChat() }
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) { Text("✦ AI", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1) }
        }
        val appt = q.homeAppt
        if (appt != null && text.isNotBlank()) {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(16.dp)).background(p.ink).clickable(role = Role.Button, onClickLabel = "Legg i kalender") { go() }
                    .padding(start = 14.dp, top = 6.dp, end = 8.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                WxIcon(H29_CAL, p.bg, 16.dp, stroke = 2f)
                Column(Modifier.weight(1f)) {
                    Text(appt.title, color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(quickLabel29(appt.date, appt.start), color = p.bg.copy(alpha = .8f), fontSize = 12.sp, maxLines = 1)
                }
                Box(Modifier.height(32.dp).clip(CircleShape).background(p.bg).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                    Text("Legg i kalender", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
                }
            }
        } else if (text.isNotBlank() && q.engine != "ai" && vm.suggestions.isNotEmpty()) PCard {
            vm.suggestions.take(5).forEachIndexed { i, sg ->
                PRow(sg, null, "↗", serif = false, top = i > 0) {
                    vm.setHomeQuery29(sg)
                    fm.clearFocus()
                    vm.goHome29()?.let { openLink(ctx, it) }
                }
            }
        }
    }
}

/** «SØK MED»: System-AI · Google · DuckDuckGo med ✓ på valgt (lagres per bruker i search_engine). */
@Composable
private fun EngineMenu29(vm: AppViewModel) {
    val p = PaperPal.current
    val q = vm.q29
    DropdownMenu(
        q.engineMenu, { q.engineMenu = false }, Modifier.width(270.dp).background(p.card),
        offset = DpOffset((-8).dp, 10.dp), shape = RoundedCornerShape(18.dp), containerColor = p.card, shadowElevation = 18.dp,
    ) {
        PLabel("Søk med", modifier = Modifier.padding(start = 14.dp, top = 6.dp, end = 14.dp, bottom = 6.dp))
        listOf(
            Triple("ai", "System-AI", "Svarer i Chat og legger til timer"),
            Triple("google", "Google", "Åpner google.com"),
            Triple("ddg", "DuckDuckGo", "Åpner duckduckgo.com"),
        ).forEachIndexed { i, (k, n, sub) ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Row(
                Modifier.fillMaxWidth().heightIn(min = 54.dp).clickable(role = Role.Button) { vm.setSearchEngine29(k) }.padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                EngineIcon29(k, if (k == "google") 20.dp else 22.dp)
                Column(Modifier.weight(1f)) {
                    Text(n, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1)
                    Text(sub, color = p.mut, fontSize = 12.sp, maxLines = 1)
                }
                Box(Modifier.alpha(if (q.engine == k) 1f else 0f)) { WxIcon(H29_CHECK, p.lab, 16.dp, stroke = 2.6f) }
            }
        }
    }
}

package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
 * Ikonet til venstre (med ▾) åpner «SØK MED»: Glimt (standard, svarer i en boble under feltet og legger til timer), Google og DuckDuckGo.
 * Menyen er en DropdownMenu (eget Popup-lag), så den ligger alltid over kortene. Timer gjenkjennes uansett søkemotor
 * (POST /api/kalender/quick/parse, lokal reserve) og legges til i bakgrunnen. ✦ AI til høyre åpner alltid Chat.
 */

private const val H29_CAL = "M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4"
private const val H29_CHEV = "M6 9l6 6 6-6"
private const val H29_CHECK = "M5 12.5l4.5 4.5L19 7"
private const val H29_X = "M6 6l12 12M18 6L6 18"

private fun placeholder29(e: String) = when (e) { "google" -> "Søk på Google"; "ddg" -> "Søk med DuckDuckGo"; else -> "Spør om været, eller skriv «time hos …»" }

/** Prompt 31: ekte logoer (vector drawables) og Glimt-merket; merket tenker mens Glimt svarer i boblen. */
@Composable
private fun EngineIcon29(e: String, size: Dp, busy: Boolean = false) = EngineLogo31(e, size, busy)

@Composable
internal fun PaperSearch29(vm: AppViewModel, above45: Boolean = false) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val fm = LocalFocusManager.current
    val q = vm.q29
    val text = q.homeQ
    val go0: () -> Unit = {
        val tx = q.homeQ
        // Prompt 41: huskebeskjed (ikke spørsmål, ikke time) → Glimt deler opp i punkter i Huskeliste. Prompt 52: også når AI sier «huske».
        if (q.engine == "ai" && q.homeAppt == null && (isHuske41(tx) || vm.qpHuske52(tx))) { vm.huskeHome41(tx); vm.setHomeQuery29("") }
        else vm.goHome29()?.let { openLink(ctx, it) }
    }
    val go: () -> Unit = {
        fm.clearFocus()
        // Prompt 52 (AND52B): Enter mens AI tolker → vent opptil 2,5 s og bruk AI-svaret.
        if (q.engine == "ai" && vm.qpPending52(text)) vm.awaitQp52(text) { go0() } else go0()
    }
    // Prompt 45 (claude-code-fold-skannikon-og-sokefelt.md): i Glimt-panelet på Fold/brett ligger svar og forslag OVER feltet
    // (svaret maks 220 dp, scroller), så de aldri havner bak tastaturet. Telefon: under feltet som før.
    val extras45: @Composable () -> Unit = { Search29Extras45(vm, text, above45, go) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (above45) extras45()
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
                    EngineIcon29(q.engine, if (q.engine == "ai") 22.dp else 18.dp, busy = vm.p31.ans?.busy == true)
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
                Modifier.size(30.dp).clip(CircleShape).background(p.line).clickable(role = Role.Button, onClickLabel = "Tøm") { vm.setHomeQuery29(""); no.kristo.finanshub.Glimt67.resetHomeConv() /* prompt 67: ny samtale */ },
                contentAlignment = Alignment.Center,
            ) { WxIcon(H29_X, p.ink, 11.dp, stroke = 3.2f) }
            SearchMic56(vm) // prompt 56 (AND56): snakk inn søket (ui/Voice56Ui.kt)
            Box(
                Modifier.height(34.dp).clip(CircleShape).background(p.bg)
                    .clickable(role = Role.Button, onClickLabel = "Åpne Chat") { Haptics.select(); fm.clearFocus(); vm.openChat() }
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) { Text("✦ AI", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1) }
        }
        VoiceBar56(vm, Voice56.SEARCH, p.ink, p.mut, PaperFonts.sans, Modifier.clip(RoundedCornerShape(16.dp)).background(p.card)) // prompt 56: Lytter / Skriver ned / motor · språk
        if (!above45) extras45()
    }
}

/** Svaret fra Glimt og forslagene (Legg i kalender / Legg i Huskeliste / søkeforslag) under – eller over – søkefeltet. */
@Composable
private fun Search29Extras45(vm: AppViewModel, text: String, above: Boolean, go: () -> Unit) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val fm = LocalFocusManager.current
    val q = vm.q29
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        val appt = q.homeAppt
        // Prompt 31: Glimt svarer i en mørk boble rett under feltet (vær, kalender, prøveperioder …).
        if (vm.p31.ans != null && text.isBlank()) {
            if (above) Box(Modifier.fillMaxWidth().heightIn(max = 220.dp).verticalScroll(rememberScrollState())) { HomeAnswer31(vm) } else HomeAnswer31(vm)
        }
        Search51Hint(vm, text) // prompt 51 (ANDFEAT51): treff fra felles søk og «Søk i alt ›» (ui/Search51Ui.kt)
        if (appt == null && text.isNotBlank() && vm.qpPending52(text)) Text("✦ Glimt tolker …", color = p.mut, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 14.dp)) // prompt 52
        if (appt != null && text.isNotBlank()) {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(16.dp)).background(p.ink).clickable(role = Role.Button, onClickLabel = "Legg i kalender") { go() }
                    .padding(start = 14.dp, top = 6.dp, end = 8.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                WxIcon(H29_CAL, p.bg, 16.dp, stroke = 2f)
                Column(Modifier.weight(1f)) {
                    Text(appt.title, color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    // Prompt 52: sted fra tolkningen og «✦ tolker …» mens AI-tilkoblingen jobber.
                    Text(listOf(quickLabel29(appt.date, appt.start), appt.place).filter { it.isNotBlank() }.joinToString(" · ") + if (vm.qpPending52(text)) " · ✦ tolker …" else "",
                        color = p.bg.copy(alpha = .8f), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Box(Modifier.height(32.dp).clip(CircleShape).background(p.bg).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                    Text("Legg i kalender", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
                }
            }
        } else if (text.isNotBlank() && q.engine == "ai" && isHuske41(text)) {
            // Prompt 41: samme mørke forslag-rad som «Legg i kalender».
            Row(
                Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(16.dp)).background(p.ink).clickable(role = Role.Button, onClickLabel = "Legg i Huskeliste") { go() }
                    .padding(start = 14.dp, top = 6.dp, end = 8.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("☑", color = p.bg, fontSize = 15.sp)
                Column(Modifier.weight(1f)) {
                    Text(text.trim(), color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("Glimt deler opp i punkter", color = p.bg.copy(alpha = .8f), fontSize = 12.sp, maxLines = 1)
                }
                Box(Modifier.height(32.dp).clip(CircleShape).background(p.bg).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                    Text("Legg i Huskeliste", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
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

/** «SØK MED»: Glimt · Google · DuckDuckGo med ✓ på valgt (lagres per bruker i search_engine). */
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
            Triple("ai", "Glimt", "Svarer her og legger til timer"),
            Triple("google", "Google", "Åpner google.com"),
            Triple("ddg", "DuckDuckGo", "Åpner duckduckgo.com"),
        ).forEachIndexed { i, (k, n, sub) ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Row(
                Modifier.fillMaxWidth().heightIn(min = 54.dp).clickable(role = Role.Button) { vm.setSearchEngine29(k) }.padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                EngineIcon29(k, 22.dp)
                Column(Modifier.weight(1f)) {
                    Text(n, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1)
                    Text(sub, color = p.mut, fontSize = 12.sp, maxLines = 1)
                }
                Box(Modifier.alpha(if (q.engine == k) 1f else 0f)) { WxIcon(H29_CHECK, p.lab, 16.dp, stroke = 2.6f) }
            }
        }
    }
}

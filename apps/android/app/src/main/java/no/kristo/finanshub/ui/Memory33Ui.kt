package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 33 (GLIMT-MEMORY): grensesnittet for «Glimt husker» (tilstand og API i Memory33.kt).
 * - Memory33Settings: Innstillinger → AI → GLIMT HUSKER (liste, Slett, Legg til, «Endre tittel på N avtaler?»).
 * - Mem33LearnLink: «Lær Glimt hva dette er…» i detaljarket i Kalender.
 * - Mem33LearnBody: innholdet i arket (velg type + navn → lagre → «Endre tittel på N avtaler?»).
 */

@Composable
private fun M33Chip(text: String, on: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Row(
        Modifier.height(38.dp).clip(CircleShape).border(1.dp, if (on) p.ink else p.line, CircleShape).background(if (on) p.ink else Color.Transparent).press24(onClick = onClick).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) { Text(text, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1) }
}

@Composable
private fun M33Btn(text: String, fill: Boolean, modifier: Modifier = Modifier, height: Dp = 46.dp, enabled: Boolean = true, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        modifier.height(height).clip(CircleShape).then(if (fill) Modifier.background(p.ink) else Modifier.border(1.dp, p.line, CircleShape)).alpha(if (enabled) 1f else .45f)
            .press24(enabled = enabled, onClick = onClick).padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = if (fill) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1) }
}

@Composable
private fun M33Field(value: String, onChange: (String) -> Unit, placeholder: String, bg: Color) {
    val p = PaperPal.current
    Box(Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(16.dp)).border(1.dp, p.line, RoundedCornerShape(16.dp)).background(bg).padding(horizontal = 16.dp, vertical = 12.dp),
        contentAlignment = Alignment.CenterStart) {
        if (value.isEmpty()) Text(placeholder, color = p.mut, fontSize = 15.sp)
        BasicTextField(value, onChange, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontFamily = PaperFonts.sans),
            cursorBrush = SolidColor(p.ink), keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Done), modifier = Modifier.fillMaxWidth())
    }
}

/* ---------------- Detaljarket ---------------- */

@Composable
internal fun Mem33LearnLink(vm: AppViewModel, e: Kal26Ev) {
    val p = PaperPal.current
    LaunchedEffect(e.id) { vm.shownMem33(e) }
    if (!e.editable) return
    Text("Lær Glimt hva dette er…", color = p.mut, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, textDecoration = TextDecoration.Underline,
        modifier = Modifier.press24 { vm.openLearn33(e) })
}

/* ---------------- Arket ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun Mem33LearnBody(vm: AppViewModel, l: Mem33Learn) {
    val p = PaperPal.current
    val s = vm.mem33
    Row(verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            PLabel("✦ Glimt husker")
            PSerif("Lær Glimt hva dette er", 24.sp)
        }
        Box(Modifier.size(40.dp).clip(CircleShape).background(p.card).press24 { s.learn = null }, contentAlignment = Alignment.Center) { Text("✕", color = p.ink, fontSize = 14.sp) }
    }
    if (l.asked) {
        Text(buildAnnotatedString { append("Ok, Glimt husker at "); withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(l.name) }; append(" er ${mem33Din(l.type)}.") },
            color = p.ink, fontSize = 15.sp, lineHeight = 21.sp)
        if (l.count > 0) {
            Text("Endre tittel på ${l.count} ${if (l.count == 1) "avtale" else "avtaler"} til «${l.title}»?", color = p.ink, fontSize = 15.sp, lineHeight = 21.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                M33Btn(if (l.busy) "Endrer …" else "Endre", true, Modifier.weight(1f), enabled = !l.busy) { vm.applyLearn33() }
                M33Btn("Nei takk", false, Modifier.weight(1f)) { s.learn = null }
            }
        } else M33Btn("Ferdig", true, Modifier.fillMaxWidth()) { s.learn = null }
        if (l.err.isNotEmpty()) Text(l.err, color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        return
    }
    if (l.text.isNotEmpty()) Text(l.text, color = p.ink, fontSize = 15.sp, lineHeight = 21.sp)
    PLabel("Hva er dette?")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        MEM33_TYPES.forEach { (k, n) -> M33Chip(n, l.type == k) { s.learn = s.learn?.copy(type = k, err = ""); Haptics.select() } }
    }
    M33Field(l.name, { v -> s.learn = s.learn?.copy(name = v) }, "Navn på avsender, f.eks. Påhåret", p.card)
    if (l.type == "annet") M33Field(l.title, { v -> s.learn = s.learn?.copy(title = v) }, "Tittel, f.eks. Massasje · Spa Nova", p.card)
    if (l.err.isNotEmpty()) Text(l.err, color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
    M33Btn(if (l.busy) "Lagrer …" else if (l.suggest) "Husk" else "Lagre", true, Modifier.fillMaxWidth(), height = 50.dp, enabled = l.type.isNotEmpty() && !l.busy) { vm.saveLearn33() }
    Text("Glimt bruker dette neste gang en melding fra samme avsender legges inn. Se Innstillinger → Glimt → Glimt husker.", color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
}

/* ---------------- Innstillinger → AI → GLIMT HUSKER ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun Memory33Settings(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.mem33
    LaunchedEffect(vm.account?.id) { vm.loadMem33(force = true) }
    var match by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("frisør") }
    var title by remember { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Glimt husker", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            if (!s.loaded) M33Text("Laster …", "")
            else if (s.items.isEmpty()) M33Text(if (s.missing) "Ikke tilgjengelig" else "Glimt husker ingenting ennå", if (s.missing) "Krever nyere server." else "Skriv f.eks. «husk at Påhåret er frisøren min» til Glimt.")
            s.items.forEachIndexed { i, it ->
                if (i > 0) M33Line()
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(it.match, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                        Text(mem33Line(it), color = p.mut, fontSize = 12.5.sp, maxLines = 2)
                    }
                    M33Btn("Slett", false, height = 34.dp) { vm.deleteMem33(it) }
                }
            }
            s.ask?.let { a ->
                M33Line()
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text("Endre tittel på ${a.count} ${if (a.count == 1) "avtale" else "avtaler"}?", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                        Text("Til «${a.title}»", color = p.mut, fontSize = 12.5.sp, maxLines = 2)
                    }
                    M33Btn("Nei", false, height = 34.dp) { vm.applyAsk33(false) }
                    M33Btn("Endre", true, height = 34.dp) { vm.applyAsk33(true) }
                }
            }
            M33Line()
            if (s.adding) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    M33Field(match, { match = it }, "Navn, f.eks. Påhåret", p.bg)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        MEM33_TYPES.forEach { (k, n) -> M33Chip(n, type == k) { type = k } }
                    }
                    M33Field(title, { title = it }, "Tittel (valgfri), f.eks. Frisør · Påhåret", p.bg)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        M33Btn("Avbryt", false, Modifier.weight(1f), height = 44.dp) { s.adding = false }
                        M33Btn("Lagre", true, Modifier.weight(1f), height = 44.dp) { vm.saveMemForm33(match, type, title); match = ""; title = "" }
                    }
                }
            } else {
                Row(Modifier.fillMaxWidth().press24 { s.adding = true; s.msg = "" }.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Legg til", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                        Text("Navn på avsender og hva det er", color = p.mut, fontSize = 12.5.sp)
                    }
                    Text("+", color = p.mut, fontSize = 18.sp)
                }
            }
        }
        Text("Det du lærer Glimt, f.eks. at «Påhåret» er frisøren din. Brukes når du legger inn timer og spør «når er neste frisørtime». Lagres bare for deg og sendes aldri til sky." +
            (if (s.msg.isNotEmpty()) " " + s.msg else ""), color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 6.dp))
    }
}

@Composable
private fun M33Line() = Box(Modifier.fillMaxWidth().height(1.dp).background(PaperPal.current.line))

@Composable
private fun M33Text(t: String, sub: String) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(t, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        if (sub.isNotEmpty()) Text(sub, color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
    }
}

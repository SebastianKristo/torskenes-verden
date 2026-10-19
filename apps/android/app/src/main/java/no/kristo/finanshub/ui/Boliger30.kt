package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.HomeDetail24
import no.kristo.finanshub.HomeEntry24
import no.kristo.finanshub.loadShareable30
import no.kristo.finanshub.patchEntry30
import no.kristo.finanshub.share30Names
import no.kristo.finanshub.shareHome30
import java.time.LocalDate

/*
 * Prompt 30 (ANDROID30) – Boliger.dc.html: «Del boligen» med rutenett av brukere i Homelab som ikke har tilgang (avatar,
 * navn, relasjon; trykk for å velge flere), ROLLE (Eier · Kan laste opp · Kan se) og «Del med Ingrid og Pål». Uten valg:
 * e-post til noen utenfor Homelab. Og redigerbar butikk, beløp og dato i detaljarket (lagres fortløpende, 400 ms).
 */

private val ROLES30 = listOf("owner" to "Eier", "editor" to "Kan laste opp", "viewer" to "Kan se")
private fun roleHelp30(r: String) = when (r) { "owner" -> "Full tilgang, kan invitere og slette."; "viewer" -> "Ser oversikt og kvitteringer."; else -> "Legger til kvitteringer og utgifter." }
private val AVC30 = listOf(0xFF2B5D8A, 0xFFA8661A, 0xFF2F6B45, 0xFF7A3B6B, 0xFFB23A2A, 0xFF3D4652)

/** Kortet «Del boligen» (bare eiere). invite = den gamle e-post-/navneinvitasjonen. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ShareHome30(vm: AppViewModel, d: HomeDetail24, invite: (String, String) -> Unit) {
    val p = PaperPal.current
    val s = vm.p30
    val id = d.home.id
    LaunchedEffect(id) { vm.loadShareable30(id) }
    var email by remember(id) { mutableStateOf("") }
    val users = s.shareUsers.takeIf { s.shareFor == id }
    // Eldre server uten /users/shareable: bare e-post/navn som før.
    val old = s.shareErr == "old"
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        PSerif("Del boligen", 20.sp, maxLines = 1)
        if (!old) {
            Label30("BRUKERE I HOMELAB")
            when {
                users == null -> Text("Henter brukere …", color = p.mut, fontSize = 13.sp)
                users.isEmpty() -> Text("Alle brukerne har allerede tilgang.", color = p.mut, fontSize = 13.sp)
                else -> FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), maxItemsInEachRow = 3) {
                    users.forEachIndexed { i, u ->
                        val on = u.id in s.shareSel
                        Box(
                            Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(if (on) p.bg else Color.Transparent)
                                .border(1.5.dp, if (on) p.ink else p.line, RoundedCornerShape(16.dp))
                                .clickable(role = Role.Checkbox, onClickLabel = u.name) { Haptics.select(); s.shareSel = if (on) s.shareSel - u.id else s.shareSel + u.id }
                                .padding(start = 6.dp, end = 6.dp, top = 12.dp, bottom = 10.dp),
                        ) {
                            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Box(Modifier.size(44.dp).clip(CircleShape).background(Color(u.color ?: AVC30[i % AVC30.size])), contentAlignment = Alignment.Center) {
                                    Text(u.initial.take(2), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                }
                                Text(u.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(u.relation ?: " ", color = p.mut, fontSize = 11.sp, maxLines = 1)
                            }
                            Box(Modifier.align(Alignment.TopEnd).padding(end = 0.dp).size(20.dp).alpha(if (on) 1f else 0f).clip(CircleShape).background(p.ink), contentAlignment = Alignment.Center) {
                                WxIcon(IC_CHECK30, p.bg, 11.dp, stroke = 3.4f)
                            }
                        }
                    }
                    // Fyll siste rad så rutene får lik bredde.
                    repeat((3 - users.size % 3) % 3) { Box(Modifier.weight(1f)) }
                }
            }
        }
        Label30("ROLLE", Modifier.padding(top = 4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ROLES30.forEach { (k, n) ->
                val on = s.shareRole == k
                Box(
                    Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(18.dp)).background(if (on) p.ink else Color.Transparent).border(1.dp, if (on) p.ink else p.line, RoundedCornerShape(18.dp))
                        .clickable { s.shareRole = k; Haptics.select() },
                    contentAlignment = Alignment.Center,
                ) { Text(n, color = if (on) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1, softWrap = false) }
            }
        }
        Text(roleHelp30(s.shareRole), color = p.mut, fontSize = 12.sp, lineHeight = 17.4.sp)
        val sel = users.orEmpty().filter { it.id in s.shareSel }
        if (sel.isEmpty()) BasicTextField(
            email, { email = it }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans),
            cursorBrush = SolidColor(p.ink),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { if (email.isNotBlank()) { invite(email, s.shareRole); email = "" } }),
            decorationBox = { inner ->
                Box(Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(14.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp), contentAlignment = Alignment.CenterStart) {
                    if (email.isEmpty()) Text(if (old) "Navn eller e-post" else "Eller e-post til noen utenfor Homelab", color = p.mut, fontSize = 15.sp, maxLines = 1)
                    inner()
                }
            },
        )
        val label = when {
            sel.isNotEmpty() -> if (s.shareBusy) "Deler …" else "Del med " + share30Names(sel.map { it.name })
            else -> "Send invitasjon"
        }
        Box(
            Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(23.dp)).background(p.ink).clickable(role = Role.Button) {
                if (sel.isNotEmpty()) vm.shareHome30(id) else if (email.isNotBlank()) { invite(email, s.shareRole); email = "" }
            },
            contentAlignment = Alignment.Center,
        ) { Text(label, color = p.bg, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1) }
    }
}

@Composable
private fun Label30(t: String, modifier: Modifier = Modifier) =
    Text(t, color = PaperPal.current.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 1.3.sp, modifier = modifier)

private fun parseAmt30(s: String): Double? = s.replace(" ", "").replace(" ", "").replace(',', '.').toDoubleOrNull()
private fun fmtAmt30(v: Double): String = if (v % 1.0 == 0.0) v.toLong().toString() else String.format(java.util.Locale("nb", "NO"), "%.2f", v)

/** Butikk/beskrivelse som redigerbar tittel (serif 26, stiplet understrek). Lagres 400 ms etter siste tastetrykk. */
@Composable
internal fun EntryTitle30(vm: AppViewModel, homeId: Int, e: HomeEntry24, modifier: Modifier = Modifier) {
    val p = PaperPal.current
    var t by remember(e.id) { mutableStateOf(e.description) }
    LaunchedEffect(t) {
        if (t.isBlank() || t == e.description) return@LaunchedEffect
        delay(400)
        vm.patchEntry30(homeId, e.id, t, null, null)
    }
    BasicTextField(
        t, { t = it }, modifier = modifier.fillMaxWidth().dashedLine30(p.line), maxLines = 3,
        textStyle = TextStyle(color = p.ink, fontSize = 26.sp, lineHeight = 30.sp, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium),
        cursorBrush = SolidColor(p.ink), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
    )
}

/** Beløp (34, «kr», desimal med komma) og dato (datovelger). */
@Composable
internal fun EntryAmountDate30(vm: AppViewModel, homeId: Int, e: HomeEntry24) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    var a by remember(e.id) { mutableStateOf(fmtAmt30(e.amount)) }
    var date by remember(e.id) { mutableStateOf(e.date.take(10)) }
    LaunchedEffect(a) {
        val v = parseAmt30(a) ?: return@LaunchedEffect
        if (kotlin.math.abs(v - e.amount) < .005) return@LaunchedEffect
        delay(400)
        vm.patchEntry30(homeId, e.id, null, v, null)
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth().dashedLine30(p.line), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            BasicTextField(
                a, { v -> a = v.filter { it.isDigit() || it == ',' || it == '.' || it == ' ' } }, singleLine = true, modifier = Modifier.weight(1f),
                textStyle = TextStyle(color = p.ink, fontSize = 34.sp, lineHeight = 37.sp, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium),
                cursorBrush = SolidColor(p.ink), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Done),
            )
            Text("kr", color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, modifier = Modifier.padding(bottom = 6.dp))
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Dato", color = p.mut, fontSize = 13.sp)
            Box(
                Modifier.weight(1f).heightIn(min = 34.dp).clip(RoundedCornerShape(10.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(10.dp))
                    .clickable(role = Role.Button, onClickLabel = "Velg dato") {
                        val d0 = runCatching { LocalDate.parse(date) }.getOrDefault(LocalDate.now())
                        android.app.DatePickerDialog(ctx, { _, y, m, dd ->
                            val nd = LocalDate.of(y, m + 1, dd).toString()
                            if (nd != date) { date = nd; Haptics.select(); vm.patchEntry30(homeId, e.id, null, null, nd) }
                        }, d0.year, d0.monthValue - 1, d0.dayOfMonth).show()
                    }.padding(horizontal = 10.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                val shown = runCatching { LocalDate.parse(date).let { String.format("%02d.%02d.%d", it.dayOfMonth, it.monthValue, it.year) } }.getOrDefault(date)
                Text(shown, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            }
        }
    }
}

/** Stiplet linje under feltet (1,5 dp). */
private fun Modifier.dashedLine30(c: Color): Modifier = this.drawBehind {
    val y = size.height - 1.dp.toPx()
    drawLine(c, Offset(0f, y), Offset(size.width, y), 1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx())))
}

package no.kristo.finanshub.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.text.InputType
import android.util.Base64
import android.view.View
import android.widget.EditText
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.compose.animation.*
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import kotlin.math.roundToInt
import kotlinx.coroutines.launch
import no.kristo.finanshub.*

/* ======================= Konto: profilbildet ======================= */

/** Toppen av Konto: profilbildet (88 dp, ring) sentrert over navnet, «Endre bilde», og Last opp nytt · Ta bilde · Fjern. */
@Composable
internal fun KontoAvatar36(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val s = vm.p36
    var shot by remember { mutableStateOf<android.net.Uri?>(null) }
    var actions by remember { mutableStateOf(false) }
    var press by remember { mutableStateOf(false) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { vm.uploadAvatar36(it) } }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) shot?.let { vm.uploadAvatar36(it) } }
    val choose = { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
    Column(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(
            Modifier.size(96.dp).clip(CircleShape).background(Color(0xFFD8D1C2)).padding(1.dp).clip(CircleShape).background(Color(0xFFF3EFE6)).padding(3.dp).clip(CircleShape)
                .tapHold36(pressed = { press = it }, onTap = { Haptics.tap(); choose() }, onHold = { actions = true }),
            contentAlignment = Alignment.Center,
        ) {
            val b = vm.avatar
            if (b != null) Image(b.asImageBitmap(), "Profilbilde", contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize().clip(CircleShape))
            else Box(Modifier.matchParentSize().background(Color(0xFF2B5D8A)), contentAlignment = Alignment.Center) {
                Text(initial(vm.displayName.ifBlank { "•" }), color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 32.sp)
            }
            if (press || s.avatarBusy) Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = .45f)), contentAlignment = Alignment.Center) {
                if (s.avatarBusy) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(26.dp))
                else Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    WxIcon("M3 8h3l2-3h8l2 3h3v11H3zM12 17a4 4 0 1 0 0-8a4 4 0 0 0 0 8", Color.White, 20.dp, stroke = 2f)
                    Text("Endre", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                }
            }
        }
        PSerif(vm.displayName.ifBlank { "Konto" }, 22.sp, maxLines = 1)
        val user = vm.me?.username?.takeIf { it.isNotBlank() } ?: vm.account?.username
        if (!user.isNullOrBlank()) Text("@$user", color = p.mut, fontSize = 13.sp)
        Text(if (actions) "Skjul" else "Endre bilde", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 14.sp,
            modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable(role = Role.Button) { Haptics.select(); actions = !actions }.padding(10.dp, 6.dp))
        AnimatedVisibility(actions) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AvBtn36("Last opp nytt", p.ink) { actions = false; choose() }
                AvBtn36("Ta bilde", p.ink) {
                    actions = false
                    val f = java.io.File(java.io.File(ctx.cacheDir, "scans").apply { mkdirs() }, "profil-${System.currentTimeMillis()}.jpg")
                    val u = androidx.core.content.FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
                    shot = u; camera.launch(u)
                }
                if (vm.avatar != null) AvBtn36("Fjern", Color(0xFFB23A2A)) { s.avatarAsk = true }
            }
        }
    }
    if (s.avatarAsk) AlertDialog(
        onDismissRequest = { s.avatarAsk = false },
        title = { Text("Fjern profilbildet?") },
        text = { Text("Bildet fjernes fra menyen, hilsenen og appen. Initialene vises i stedet.") },
        confirmButton = { TextButton({ s.avatarAsk = false; actions = false; vm.removeAvatar() }) { Text("Fjern", color = Color(0xFFB23A2A), fontWeight = FontWeight.Bold) } },
        dismissButton = { TextButton({ s.avatarAsk = false }) { Text("Avbryt") } },
    )
}

@Composable
private fun AvBtn36(text: String, fg: Color, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp)).clickable(role = Role.Button) { Haptics.select(); onClick() }.padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center) { Text(text, color = fg, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1) }
}

/** Miniatyr (40 dp rund) til høyre på raden «Profilbilde». */
@Composable
internal fun AvatarThumb36(vm: AppViewModel) {
    val b = vm.avatar ?: return
    Image(b.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.size(40.dp).clip(CircleShape))
}

/* ======================= Onboarding: koble bruker til profil ======================= */

private val OB_LINKS37 = listOf(
    listOf("location", "Posisjon og Familie-kart", "Del posisjonen din med husstanden", "M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z", "2f6b45"),
    listOf("lists", "Gjøremål", "Delte lister: Hjem, Handel", "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2", "b23a2a"),
    listOf("subs", "Delte abonnementer", "Abonnementer som deles med deg", "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3", "a8661a"),
    listOf("calendars", "Kalendere", "Familie og felles kalender", "M4 5h16v15H4zM4 10h16M9 3v4M15 3v4", "2b5d8a"),
    listOf("health", "Helse", "Health Connect på denne enheten", "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z", "c2477a"),
)

/** Steg 2–4 av onboardingen (steg 1, innloggingen, er den vanlige innloggingen). Mobil først, maks 440 dp. */
@Composable
internal fun Onboard37(vm: AppViewModel) {
    val s = vm.p37
    val bg = Color(0xFFF3EFE6); val ink = Color(0xFF1B1A17); val mut = Color(0xFF6B665C); val card = Color(0xFFFFFDF8); val line = Color(0xFFDDD5C5)
    val user = (vm.me?.username ?: vm.account?.username ?: "bruker").lowercase()
    BackHandler { if (s.obStep in 2..2) s.obStep-- else vm.closeOnboard37(skip = s.obStep == 3) }
    val sel = s.profiles.firstOrNull { it.id == s.obSel }
    val me = if (s.obNew) Profile37("ny", s.obNewName.trim().ifBlank { "Ny bruker" }, 0xFF3D7F8A, null, null, null, false, false, false, false)
        else s.obLinked ?: sel ?: s.profiles.firstOrNull { it.id == s.obMine }
    Box(Modifier.fillMaxSize().background(bg).clickable(remember { MutableInteractionSource() }, null) {}, contentAlignment = Alignment.TopCenter) {
        Column(Modifier.widthIn(max = 440.dp).fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding().padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 22.dp)) {
            Row(Modifier.fillMaxWidth().height(44.dp), verticalAlignment = Alignment.CenterVertically) {
                if (s.obStep == 2) Box(Modifier.size(40.dp).clip(CircleShape).border(1.dp, line, CircleShape).background(card).clickable(role = Role.Button, onClickLabel = "Tilbake") { s.obStep = 1 },
                    contentAlignment = Alignment.Center) { WxIcon("M15 6l-6 6 6 6", ink, 16.dp, stroke = 2.6f) }
                else if (s.obStep == 1) Box(Modifier.height(40.dp).clip(CircleShape).clickable(role = Role.Button) { vm.closeOnboard37(skip = false) }.padding(horizontal = 8.dp), contentAlignment = Alignment.Center) {
                    Text("Senere", color = mut, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                } else Spacer(Modifier.size(40.dp))
                Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterHorizontally)) {
                    (0..3).forEach { i ->
                        val w by animateDpAsState(if (i == s.obStep) 26.dp else 6.dp, tween(300), label = "obDot")
                        Box(Modifier.size(w, 6.dp).clip(RoundedCornerShape(3.dp)).background(if (i <= s.obStep) ink else line))
                    }
                }
                Spacer(Modifier.size(40.dp))
            }
            AnimatedContent(s.obStep, transitionSpec = { (fadeIn(tween(300)) + slideInHorizontally(tween(350)) { it / 20 }) togetherWith fadeOut(tween(150)) }, label = "ob37", modifier = Modifier.weight(1f)) { st ->
                when (st) {
                    1 -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = 22.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text("STEG 2 AV 3", color = Color(0xFFB23A2A), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 1.8.sp)
                        Text("Hvem er du?", color = ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 36.sp, lineHeight = 38.sp)
                        if (s.obLocked && s.obMine != null) {
                            Text("Admin har koblet deg til ${me?.name ?: "en profil"}. Bekreft at det er deg.", color = Color(0xFF3D3A33), fontSize = 15.sp, lineHeight = 22.sp)
                            me?.let { ProfileRow37(it, true, false, null) {} }
                        } else {
                            Text("Koble brukeren @$user til en profil. Profilen har posisjon, gjøremål, delte abonnementer og kalendere som allerede finnes.", color = Color(0xFF3D3A33), fontSize = 15.sp, lineHeight = 22.sp)
                            val sug = s.profiles.firstOrNull { it.id == s.obSel && it.userId == null }
                            if (sug != null && !s.obNew) Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(card).border(1.dp, line, RoundedCornerShape(14.dp)).padding(12.dp, 10.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("✦", color = Color(0xFFB23A2A), fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                                Text("Glimt tror du er ${sug.name} (samme navn som brukeren).", color = Color(0xFF3D3A33), fontSize = 13.sp, modifier = Modifier.weight(1f))
                            }
                            s.profiles.forEach { pr ->
                                val taken = pr.other || (pr.userId != null && pr.id != s.obMine && !pr.username.equals(user, true))
                                ProfileRow37(pr, !s.obNew && s.obSel == pr.id, taken, if (taken) "Koblet til @${pr.username ?: "en annen"}" else null) {
                                    if (!taken) { Haptics.select(); s.obSel = pr.id; s.obNew = false }
                                }
                            }
                            Row(Modifier.fillMaxWidth().heightIn(min = 58.dp).clip(RoundedCornerShape(18.dp)).border(2.dp, if (s.obNew) ink else line, RoundedCornerShape(18.dp))
                                .clickable(role = Role.Button) { s.obNew = true; s.obSel = null }.padding(14.dp, 10.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Box(Modifier.size(44.dp).clip(CircleShape).background(Color(0xFFE9E2D3)), contentAlignment = Alignment.Center) { Text("+", color = ink, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp) }
                                Column(Modifier.weight(1f)) {
                                    Text("Jeg er ny i husstanden", color = ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                    Text("Lag en ny profil for meg", color = mut, fontSize = 12.5.sp)
                                }
                            }
                            if (s.obNew) BasicTextField(s.obNewName, { s.obNewName = it.take(40) }, singleLine = true,
                                textStyle = TextStyle(color = ink, fontSize = 16.sp, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Medium), cursorBrush = SolidColor(Color(0xFFB23A2A)),
                                modifier = Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(14.dp)).border(1.dp, line, RoundedCornerShape(14.dp)).background(card).padding(horizontal = 14.dp),
                                decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (s.obNewName.isEmpty()) Text("Navnet ditt", color = mut, fontSize = 16.sp); inner() } })
                        }
                        s.obErr?.let { Text(it, color = Color(0xFFB23A2A), fontSize = 13.sp) }
                    }
                    2 -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = 22.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text("STEG 3 AV 3", color = Color(0xFFB23A2A), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 1.8.sp)
                        Text("Dette kobles til deg", color = ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 36.sp, lineHeight = 38.sp)
                        me?.let { m ->
                            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(card).padding(14.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Box(Modifier.size(44.dp).clip(CircleShape).background(Color(m.color)), contentAlignment = Alignment.Center) { Text(m.name.take(1), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp) }
                                Column(Modifier.weight(1f)) {
                                    Text(m.name, color = ink, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                    Text("@$user ⟷ profil", color = mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                                }
                            }
                        }
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(card).padding(horizontal = 14.dp)) {
                            OB_LINKS37.filter { !s.obNew || it[0] != "subs" }.forEachIndexed { i, l ->
                                val on = s.obConsent[l[0]] == true
                                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFE6DFD1)))
                                Row(Modifier.fillMaxWidth().heightIn(min = 58.dp).clickable(role = Role.Switch) { Haptics.select(); s.obConsent = s.obConsent + (l[0] to !on) },
                                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    val c = Color(0xFF000000L or l[4].toLong(16))
                                    Box(Modifier.size(32.dp).clip(RoundedCornerShape(10.dp)).background(c.copy(alpha = .12f)), contentAlignment = Alignment.Center) { WxIcon(l[3], c, 16.dp, stroke = 2.2f) }
                                    Column(Modifier.weight(1f)) {
                                        Text(l[1], color = ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
                                        Text(if (s.obNew && l[0] == "lists") "Du blir lagt til i felles lister" else l[2], color = mut, fontSize = 12.sp)
                                    }
                                    Box(Modifier.size(46.dp, 28.dp).clip(RoundedCornerShape(14.dp)).background(if (on) Color(0xFF2F7A4F) else line).padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
                                        Box(Modifier.size(22.dp).shadow(2.dp, CircleShape).clip(CircleShape).background(Color.White))
                                    }
                                }
                            }
                        }
                        Text("Du kan endre koblingen senere i Innstillinger → Konto → Profil. Admin får beskjed om nye koblinger.", color = mut, fontSize = 12.5.sp)
                        s.obErr?.let { Text(it, color = Color(0xFFB23A2A), fontSize = 13.sp) }
                    }
                    else -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically)) {
                        val m = me
                        val sc = remember { Animatable(.6f) }
                        LaunchedEffect(Unit) { sc.animateTo(1f, spring(.45f, 300f)) }
                        Box(Modifier.size(96.dp).graphicsLayer { scaleX = sc.value; scaleY = sc.value }.shadow(18.dp, CircleShape).clip(CircleShape).background(Color(m?.color ?: 0xFF3D7F8A)), contentAlignment = Alignment.Center) {
                            Text((m?.name ?: "?").take(1), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 34.sp)
                        }
                        Text("Hei, ${firstName37(m?.name ?: vm.displayName)}!", color = ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 38.sp, textAlign = TextAlign.Center)
                        val n = s.obConsent.count { (k, v) -> v && (!s.obNew || k != "subs") }
                        Text("@$user er nå koblet til ${m?.name ?: "profilen"}. $n ting er satt opp for deg, og resten av husstanden ser deg som ${firstName37(m?.name ?: "")}.",
                            color = Color(0xFF3D3A33), fontSize = 15.sp, lineHeight = 22.sp, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 320.dp))
                    }
                }
            }
            val ok = when (s.obStep) { 1 -> if (s.obLocked && s.obMine != null) true else if (s.obNew) s.obNewName.isNotBlank() else s.obSel != null; else -> true }
            val label = when (s.obStep) { 1 -> if (s.obLocked && s.obMine != null) "Bekreft" else if (s.obNew) "Lag profil" else "Dette er meg"; 2 -> if (s.obBusy) "Kobler …" else "Koble og fortsett"; else -> "Gå til Hjem" }
            Box(Modifier.fillMaxWidth().height(54.dp).clip(RoundedCornerShape(27.dp)).background(if (ok) ink else Color(0xFFA39D90)).clickable(enabled = ok && !s.obBusy, role = Role.Button) {
                Haptics.tap()
                when (s.obStep) {
                    1 -> if (s.obLocked && s.obMine != null) vm.linkProfile37() else { s.obErr = null; s.obStep = 2 }
                    2 -> vm.linkProfile37()
                    else -> { vm.closeOnboard37(skip = true); vm.paperTab("hjem") }
                }
            }, contentAlignment = Alignment.Center) { Text(label, color = bg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp) }
        }
    }
}

@Composable
private fun ProfileRow37(pr: Profile37, on: Boolean, taken: Boolean, sub: String?, onClick: () -> Unit) {
    val ink = Color(0xFF1B1A17)
    val has = sub ?: listOfNotNull(if (pr.hasLoc) "Posisjon" else null, if (pr.hasLists) "Delte lister" else null, if (pr.hasSubs) "Abonnementer" else null).joinToString(" · ").ifBlank { "Profil i husstanden" }
    Row(Modifier.fillMaxWidth().heightIn(min = 66.dp).alpha(if (taken) .45f else 1f).clip(RoundedCornerShape(18.dp)).border(2.dp, if (on) ink else Color.Transparent, RoundedCornerShape(18.dp))
        .background(Color(0xFFFFFDF8)).clickable(enabled = !taken, role = Role.RadioButton) { onClick() }.padding(14.dp, 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(44.dp).clip(CircleShape).background(Color(pr.color)), contentAlignment = Alignment.Center) { Text(pr.name.take(1), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp) }
        Column(Modifier.weight(1f)) {
            Text(pr.name, color = ink, fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(has, color = Color(0xFF6B665C), fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Box(Modifier.size(24.dp).clip(CircleShape).border(2.dp, if (on) ink else Color(0xFFDDD5C5), CircleShape).background(if (on) ink else Color.Transparent), contentAlignment = Alignment.Center) {
            if (on) Text("✓", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
        }
    }
}

/* ======================= Konto → Profil ======================= */

@Composable
internal fun ProfileLink37(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p37
    LaunchedEffect(vm.account?.id) { vm.loadProfiles37() }
    if (profilesMissing37 && s.profiles.isEmpty()) return
    val mine = s.profiles.firstOrNull { it.id == s.obMine }
    PCard(Modifier.padding(top = 8.dp)) {
        PRow("Profil", when {
            mine != null -> "Koblet til ${mine.name}" + if (s.obLocked) " · admin styrer koblingen" else ""
            s.obLocked -> "Ikke koblet · admin kobler deg til en profil"
            else -> "Ikke koblet til en profil i husstanden"
        }, if (mine == null && !s.obLocked) "Koble ›" else "", serif = false) { if (mine == null && !s.obLocked) vm.reopenOnboard37() }
    }
}

/* ======================= Konto → ØKT ======================= */

@Composable
private fun SesRow38(icon: ImageVector, tint: Color, title: String, sub: String?, red: Boolean = false, top: Boolean = false, onClick: () -> Unit) {
    val p = PaperPal.current
    Column {
        if (top) Box(Modifier.fillMaxWidth().padding(start = 60.dp).height(1.dp).background(p.line))
        Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(14.dp, 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.size(32.dp).clip(RoundedCornerShape(9.dp)).background(tint), contentAlignment = Alignment.Center) {
                androidx.compose.material3.Icon(icon, null, tint = Color.White, modifier = Modifier.size(18.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(title, color = if (red) RED38 else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1)
                if (!sub.isNullOrBlank()) Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (!red) Text("›", color = p.mut, fontSize = 16.sp)
        }
    }
}

/** Nederst på Konto: ENHETER (Logg inn på ny enhet) og ØKT (Lås skjermen, Logg ut, Logg ut av alle enheter). */
@Composable
internal fun Session38(vm: AppViewModel) {
    val s = vm.p38
    val ctx = LocalContext.current
    LaunchedEffect(vm.account?.id) { vm.loadSessions38() }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Enheter", modifier = Modifier.padding(start = 4.dp, top = 6.dp))
        PCard {
            SesRow38(Icons.Filled.QrCodeScanner, Color(0xFF2E6F75), "Logg inn på annen enhet", "Skann QR-koden på Mac, nettbrett, Kalender eller en annen mobil") { vm.openQr38() }
        }
        PLabel("Økt", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            SesRow38(Icons.Filled.Lock, BLUE38, "Lås skjermen", "Krever fingeravtrykk, ansikt eller PIN for å fortsette") {
                val auth = BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
                if (BiometricManager.from(ctx).canAuthenticate(auth) != BiometricManager.BIOMETRIC_SUCCESS) vm.message = "Sett opp skjermlås på telefonen for å låse appen"
                else { Haptics.tap(); vm.locked = true; (ctx.activity38() as? MainActivity)?.unlock() }
            }
            SesRow38(Icons.AutoMirrored.Filled.Logout, RED38, "Logg ut", "Bare denne enheten", red = true, top = true) { Haptics.tap(); s.outAsk = true }
            SesRow38(Icons.Filled.Devices, Color(0xFF6B665C), "Logg ut av alle enheter",
                s.sessions?.let { n -> "$n ${if (n == 1) "enhet er" else "enheter er"} logget inn · krever passord" } ?: "Avslutter alle økter · krever passord", top = true) {
                Haptics.tap(); s.allPw = ""; s.allErr = null; s.allOpen = true
            }
        }
    }
}

@Composable
internal fun LogoutAllSheet38(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p38
    Sheet38({ if (!s.allBusy) s.allOpen = false }) {
        PSerif("Logg ut av alle enheter", 24.sp, maxLines = 1)
        Text(
            "Alle økter avsluttes, også på denne telefonen" + (s.sessions?.let { " ($it ${if (it == 1) "enhet" else "enheter"} er logget inn nå)" } ?: "") + ". Skriv passordet for å bekrefte.",
            color = p.mut, fontSize = 13.5.sp, lineHeight = 19.sp,
        )
        Box(Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(14.dp)).background(p.card).border(1.dp, if (s.allErr != null) RED38 else p.line, RoundedCornerShape(14.dp))
            .padding(horizontal = 14.dp), contentAlignment = Alignment.CenterStart) {
            if (s.allPw.isEmpty()) Text("Passord", color = p.mut, fontSize = 14.5.sp)
            BasicTextField(s.allPw, { s.allPw = it; s.allErr = null }, singleLine = true, visualTransformation = PasswordVisualTransformation(),
                textStyle = TextStyle(color = p.ink, fontSize = 14.5.sp), cursorBrush = SolidColor(p.ink),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
        }
        s.allErr?.let { Text(it, color = RED38, fontSize = 13.sp) }
        PButton(if (s.allBusy) "Logger ut …" else "Logg ut av alle", Modifier.fillMaxWidth(), kind = "lab") { vm.logoutAll38() }
    }
}

/* ======================= Profilbilde: initialer ======================= */

internal val AV39_BG = Color(0xFF2B5D8A)

/** «Sebastian Kristoffersen» → «SK», «sebastian» → «S». */
internal fun initials39(name: String): String {
    val w = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    val s = w.take(2).mapNotNull { x -> x.firstOrNull { it.isLetterOrDigit() }?.uppercase() }.joinToString("")
    return s.ifEmpty { "•" }
}

/* ======================= 2FA i appen ======================= */

/** Raden i Innstillinger → Sikkerhet. Av: «Sett opp ›», på: «Endre ›». Åpner oppsettet i appen (ikke nettleseren). */
@Composable
internal fun TfRow40(vm: AppViewModel) {
    LaunchedEffect(vm.account?.id) { vm.loadTf40() }
    val on = vm.p40.tf?.enabled ?: (vm.me?.totp == true)
    val left = vm.p40.tf?.backupLeft
    Row(Modifier.fillMaxWidth().clickable(role = Role.Button) { vm.openTf40() }.padding(16.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f)) {
            Text("Totrinnsbekreftelse", color = C.text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            Text(if (on) "På · autentiseringsapp" + (left?.let { " · $it reservekoder igjen" } ?: "") else "Av · sett opp i appen på 1 minutt", color = C.text2, fontSize = 12.5.sp)
        }
        Text(if (on) "Endre ›" else "Sett opp ›", color = C.primary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
    }
}

@Composable
internal fun TwoFa40Screen(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p40
    val ctx = LocalContext.current
    fun back() {
        when {
            s.tfManage != null && s.tfStep == 10 -> s.tfManage = null
            s.tfStep in 1..2 -> s.tfStep -= 1
            else -> s.tfOpen = false
        }
    }
    BackHandler { back() }
    Box(Modifier.fillMaxSize().background(p.bg).clickable(remember { MutableInteractionSource() }, null) {}) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().imePadding().padding(18.dp, 10.dp, 18.dp, 30.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.height(34.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).clickable(role = Role.Button) { back() }.padding(start = 10.dp, end = 14.dp),
                    contentAlignment = Alignment.Center) { Text("‹ Tilbake", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp) }
                Spacer(Modifier.weight(1f))
                if (s.tfStep in 0..3) Text("Steg ${s.tfStep + 1} av 4", color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp)
            }
            if (s.tfStep in 0..3) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                repeat(4) { i -> Box(Modifier.weight(1f).height(4.dp).clip(RoundedCornerShape(2.dp)).background(if (i <= s.tfStep) p.lab else p.line)) }
            }
            PLabel("SIKKERHET · TOTRINNSBEKREFTELSE", p.mut)
            when (s.tfStep) {
                0 -> TfMethod40(vm)
                1 -> TfConnect40(vm, ctx)
                2 -> TfCode40(vm)
                3 -> TfCodes40(vm, ctx, final = true)
                4 -> TfDone40(vm)
                else -> TfManage40(vm, ctx)
            }
            s.tfErr?.let { Text(it, color = p.lab, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold) }
            if (s.tfBusy) CircularProgressIndicator(color = p.ink, modifier = Modifier.size(26.dp))
        }
    }
}

@Composable
private fun TfOption40(title: String, sub: String, badge: String?, enabled: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(18.dp))
        .clickable(enabled = enabled, role = Role.Button) { onClick() }.padding(16.dp).graphicsLayer { alpha = if (enabled) 1f else .55f },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.5.sp)
                badge?.let { Text(it, color = p.pos, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(p.posSoft).padding(6.dp, 2.dp)) }
            }
            Text(sub, color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
        }
        Text("›", color = p.mut, fontSize = 18.sp)
    }
}

@Composable
private fun TfMethod40(vm: AppViewModel) {
    val p = PaperPal.current
    var pw by remember { mutableStateOf("") }
    PSerif("Velg metode", 30.sp)
    Text("Koden fra en autentiseringsapp gjør kontoen din tryggere. Alt skjer her i appen.", color = p.mut, fontSize = 14.sp)
    TfOption40("Autentiseringsapp", "Passord (iOS), Google Authenticator, 1Password, Aegis … på denne telefonen", "Anbefalt", true) { vm.setupTf40() }
    TfOption40("Passnøkkel med fingeravtrykk", "Raskest · kommer når serveren støtter passnøkler", "Raskest", false) {}
    if (vm.p40.tfNeedPw) {
        Text("Bekreft med passordet ditt for å fortsette.", color = p.ink, fontSize = 13.5.sp)
        PField("Passord", pw, { pw = it }, password = true, onDone = { vm.setupTf40(pw) })
        PButton("Fortsett", Modifier.fillMaxWidth()) { vm.setupTf40(pw) }
    }
}

@Composable
private fun TfConnect40(vm: AppViewModel, ctx: Context) {
    val p = PaperPal.current
    val su = vm.p40.tfSetup ?: return
    var qr by remember { mutableStateOf(false) }
    var copied by remember { mutableStateOf(false) }
    PSerif("Koble til", 30.sp)
    Text("Trykk knappen: autentiseringsappen på denne telefonen åpnes og legger til «${su.issuer}» av seg selv. Ingen QR å skanne.", color = p.mut, fontSize = 14.sp, lineHeight = 20.sp)
    PButton("Åpne i autentiseringsappen", Modifier.fillMaxWidth(), height = 54.dp) {
        val ok = runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(su.otpauth)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess
        if (!ok) vm.message = "Fant ingen autentiseringsapp. Installer f.eks. Google Authenticator eller Aegis, eller kopier nøkkelen."
        else vm.p40.tfStep = 2
    }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PLabel("HEMMELIG NØKKEL", p.mut)
        Text(tfGroups40(su.secret), color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, letterSpacing = 1.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton(if (copied) "Kopiert" else "Kopier", Modifier.weight(1f), kind = "line", height = 40.dp) {
                copy40(ctx, "Nøkkel", su.secret); copied = true; Haptics.select()
            }
            PButton(if (qr) "Skjul QR" else "Vis QR-kode", Modifier.weight(1f), kind = "line", height = 40.dp) { qr = !qr }
        }
        if (qr) {
            val bmp = remember(su.qrPng) { su.qrPng?.substringAfter("base64,", "")?.takeIf { it.isNotBlank() }?.let { b ->
                runCatching { Base64.decode(b, Base64.DEFAULT).let { android.graphics.BitmapFactory.decodeByteArray(it, 0, it.size) } }.getOrNull()
            } }
            if (bmp != null) Image(bmp.asImageBitmap(), "QR-kode for en annen enhet", Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(12.dp)).background(Color.White).padding(12.dp))
            else Text("Serveren sendte ingen QR-kode som bilde. Skriv inn nøkkelen over i appen på den andre enheten.", color = p.mut, fontSize = 12.5.sp)
        }
    }
    PButton("Jeg har lagt den til ›", Modifier.fillMaxWidth(), kind = "line") { vm.p40.tfStep = 2 }
}

@Composable
private fun TfCode40(vm: AppViewModel) {
    val p = PaperPal.current
    var code by remember { mutableStateOf("") }
    PSerif("Skriv koden", 30.sp)
    Text("Skriv de 6 sifrene autentiseringsappen viser nå. Koden kan også fylles inn automatisk.", color = p.mut, fontSize = 14.sp)
    // EditText med autofill-hint for engangskoder (SMS_OTP / ONE_TIME_CODE), så koden kan autofylles.
    AndroidView(
        factory = { c: Context ->
            EditText(c).apply {
                inputType = InputType.TYPE_CLASS_NUMBER
                textSize = 28f
                letterSpacing = .4f
                hint = "000000"
                filters = arrayOf<android.text.InputFilter>(android.text.InputFilter.LengthFilter(6))
                if (Build.VERSION.SDK_INT >= 26) {
                    setAutofillHints("smsOTPCode", "oneTimeCode", "2faAppOTPCode")
                    importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_YES
                }
                addTextChangedListener(object : android.text.TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c2: Int) {}
                    override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c2: Int) {}
                    override fun afterTextChanged(e: android.text.Editable?) {
                        code = e?.toString() ?: ""
                        if (code.length == 6) vm.enableTf40(code)
                    }
                })
                requestFocus()
            }
        },
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(horizontal = 14.dp),
    )
    PButton("Bekreft", Modifier.fillMaxWidth()) { vm.enableTf40(code) }
}

@Composable
private fun TfCodes40(vm: AppViewModel, ctx: Context, final: Boolean) {
    val p = PaperPal.current
    val codes = vm.p40.tfCodes
    var saved by remember { mutableStateOf(false) }
    PSerif("Reservekoder", 30.sp)
    Text("Bruk en av disse hvis du mister telefonen. Hver kode virker én gang. Lagre dem et trygt sted.", color = p.mut, fontSize = 14.sp, lineHeight = 20.sp)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        codes.chunked(2).forEach { r ->
            Row(Modifier.fillMaxWidth()) { r.forEach { c -> Text(c, color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, modifier = Modifier.weight(1f)) } }
        }
        if (codes.isEmpty()) Text("Serveren sendte ingen reservekoder.", color = p.mut, fontSize = 13.sp)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PButton("Kopier alle", Modifier.weight(1f), kind = "line", height = 44.dp) { copy40(ctx, "Reservekoder", codes.joinToString("\n")); Haptics.select(); vm.flash("Kopiert") }
        PButton("Lagre / Del", Modifier.weight(1f), kind = "line", height = 44.dp) {
            runCatching {
                ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, "Reservekoder · Nordlys OS").putExtra(Intent.EXTRA_TEXT, codes.joinToString("\n")), "Lagre reservekodene").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }
    }
    if (final) {
        Row(Modifier.fillMaxWidth().clickable(role = Role.Checkbox) { saved = !saved }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(24.dp).clip(RoundedCornerShape(7.dp)).background(if (saved) p.pos else Color.Transparent).border(2.dp, if (saved) p.pos else p.line, RoundedCornerShape(7.dp)),
                contentAlignment = Alignment.Center) { if (saved) Text("✓", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
            Text("Jeg har lagret reservekodene", color = p.ink, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold)
        }
        PButton("Fullfør", Modifier.fillMaxWidth().graphicsLayer { alpha = if (saved) 1f else .45f }) { if (saved) { vm.p40.tfStep = 4; Haptics.success() } }
    } else PButton("Ferdig", Modifier.fillMaxWidth()) { vm.p40.tfManage = null }
}

@Composable
private fun TfDone40(vm: AppViewModel) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(top = 30.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(72.dp).clip(CircleShape).background(p.posSoft), contentAlignment = Alignment.Center) { Text("✓", color = p.pos, fontSize = 34.sp, fontWeight = FontWeight.Bold) }
        PSerif("Totrinnsbekreftelse er på", 28.sp)
        Text("Denne telefonen er merket som pålitelig enhet. Fra internett ber Homelab om koden når du logger inn.", color = p.mut, fontSize = 14.sp, textAlign = TextAlign.Center)
        PButton("Ferdig", Modifier.fillMaxWidth()) { vm.p40.tfOpen = false; vm.loadTf40() }
    }
}

@Composable
private fun TfManage40(vm: AppViewModel, ctx: Context) {
    val p = PaperPal.current
    val s = vm.p40
    var pw by remember { mutableStateOf("") }
    when (s.tfManage) {
        "codes" -> { TfCodes40(vm, ctx, final = false); return }
        "disable" -> {
            PSerif("Slå av", 30.sp)
            Text("Skriv passordet ditt (eller en kode fra appen) for å slå av totrinnsbekreftelse.", color = p.mut, fontSize = 14.sp)
            PField("Passord eller kode", pw, { pw = it }, password = true, onDone = { vm.disableTf40(pw) })
            PButton("Slå av totrinnsbekreftelse", Modifier.fillMaxWidth(), kind = "lab") { vm.disableTf40(pw) }
            return
        }
    }
    PSerif("Totrinnsbekreftelse", 30.sp)
    val t = s.tf
    Text("På · autentiseringsapp" + (t?.backupLeft?.let { " · $it reservekoder igjen" } ?: ""), color = p.pos, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    PCard {
        PRow("Nye reservekoder", "De gamle slutter å virke", "›", serif = false) { vm.regenTf40() }
        PRow("Bytt autentiseringsapp", "Ny nøkkel til en annen app", "›", serif = false, top = true) { s.tfStep = 0; vm.setupTf40() }
        PRow("Legg til passnøkkel", "Kommer når serveren støtter passnøkler", "", serif = false, top = true)
        PRow("Slå av", "Krever passord", "›", p.lab, serif = false, top = true) { s.tfManage = "disable" }
    }
}

private fun copy40(ctx: Context, label: String, text: String) {
    runCatching { (ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText(label, text)) }
}

internal val RED44u = Color(0xFFB23A2A)

internal val GREEN44u = Color(0xFF2F6B4A)

internal val YEL44u = Color(0xFFA0671A)

/* ---------------- Kontoer og brukere ---------------- */

@Composable
internal fun Accounts44(vm: AppViewModel) {
    val p = PaperPal.current
    val t = vm.p44
    if (!vm.userIsAdmin || vm.impersonating44) return
    LaunchedEffect(vm.account?.id) { vm.loadAsUsers44(); vm.loadOwner44() }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Familie · logg inn som", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            val us = t.asUsers
            if (us == null) Text("Henter brukere …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
            else if (us.isEmpty()) Text("Ingen andre brukere på serveren.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
            us.orEmpty().forEachIndexed { i, u ->
                PRow(u.name, listOfNotNull(roleNo44(u.role), u.device, if (u.locked) "låst oppsett" else "kan endre selv").joinToString(" · "), "›", top = i > 0) { t.asSheet = u }
            }
        }
        Text("Logg inn som et familiemedlem for å rydde i Hjem, fanelinja og Mer. Uten passord, fordi du er admin. Gå ut når du er ferdig.",
            color = p.mut, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
        PLabel("Server · eier", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            val o = t.owner
            PRow("Eier av serveren", o?.let { it.name + (if (it.me) " (deg)" else "") + (it.since?.let { s -> " · startet serveren ${s.take(10)}" } ?: "") } ?: "Henter …", "", serif = false)
            o?.pending?.let { PRow("Venter på godkjenning", it, "", serif = false, top = true) }
            if (o?.canTransfer != false) PRow("Overfør eierskap", "Velg ny eier · krever bekreftelse", "›", RED44u, serif = false, top = true) {
                t.ownSheet = true; t.ownStep = 0; t.ownPick = null; t.ownErr = null
            }
        }
    }
    t.asSheet?.let { AsSheet44(vm, it) }
    if (t.ownSheet) OwnSheet44(vm)
}

private fun roleNo44(r: String?) = when (r) { "admin" -> "Admin"; "owner", "eier" -> "Eier"; null, "" -> null; "user", "bruker" -> "Bruker"; else -> r.replaceFirstChar { it.uppercase() } }

@Composable
private fun AsSheet44(vm: AppViewModel, u: AsUser44) {
    val p = PaperPal.current
    val t = vm.p44
    Sheet43({ t.asSheet = null }) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(54.dp).clip(CircleShape).background(u.color?.let { Color(it) } ?: p.ink), contentAlignment = Alignment.Center) {
                Text(u.name.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 22.sp)
            }
            Column { PSerif(u.name, 24.sp, maxLines = 1); Text(listOfNotNull(roleNo44(u.role), u.device).joinToString(" · "), color = p.mut, fontSize = 13.sp) }
        }
        Btn43(if (t.asBusy) "Logger inn …" else "Logg inn som ${firstName37(u.name)}", color = RED44u, modifier = Modifier.fillMaxWidth(), enabled = !t.asBusy) { vm.loginAs44(u) }
        Text("Uten passord, fordi du er admin. Appen lastes på nytt som ${firstName37(u.name)}. Endringer lagres på ${firstName37(u.name)} sin konto. " +
            "Chat, Finans og Helse er skrivebeskyttet, og passord, 2FA og rolle kan ikke endres. Trykk «Gå ut» øverst når du er ferdig.", color = p.mut, fontSize = 12.5.sp, lineHeight = 18.sp)
        var ask by remember(u.id) { mutableStateOf<String?>(null) }
        PCard {
            PRow("Kopier mitt oppsett hit", "Hjem, fanelinje og Mer", "›", serif = false) { ask = "copy-from-me" }
            PRow("Tilbakestill til standard", null, "›", serif = false, top = true) { ask = "reset" }
            PToggle("${firstName37(u.name)} kan endre selv", if (u.locked) "Av: oppsettet styres av deg" else "Wiggle-redigering er på hos ${firstName37(u.name)}", !u.locked, top = true) { on -> vm.layoutAct44(u, "lock", locked = !on) }
        }
        ask?.let { a ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Btn43(if (a == "reset") "Tilbakestill" else "Kopier", color = RED44u) { ask = null; vm.layoutAct44(u, a) }
                Btn43("Avbryt") { ask = null }
            }
        }
    }
}

@Composable
private fun OwnSheet44(vm: AppViewModel) {
    val p = PaperPal.current
    val t = vm.p44
    var typed by remember { mutableStateOf("") }
    var pw by remember { mutableStateOf("") }
    Sheet43({ t.ownSheet = false }) {
        PSerif("Overfør eierskap", 24.sp)
        if (t.ownStep == 0) {
            Text("Den nye eieren får ansvaret for serveren: backup-nøkkel, varsler om serverfeil og kontoer som er koblet til eierkontoen. Du blir admin.",
                color = p.mut, fontSize = 13.sp, lineHeight = 18.sp)
            (t.ownCands ?: t.asUsers).orEmpty().forEach { u ->
                val on = t.ownPick?.id == u.id
                val why = if (t.ownCands != null) u.device else null // grunnen til at personen ikke kan bli eier (f.eks. 2FA mangler)
                Row(Modifier.fillMaxWidth().heightIn(min = 54.dp).clip(RoundedCornerShape(14.dp)).background(if (on) p.ink else p.card).clickable(enabled = why == null) { t.ownPick = u }.padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(32.dp).clip(CircleShape).background(u.color?.let { Color(it) } ?: p.mut), contentAlignment = Alignment.Center) {
                        Text(u.name.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(u.name, color = if (on) p.bg else if (why != null) p.mut else p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        why?.let { Text(it, color = RED44u, fontSize = 11.5.sp) }
                    }
                    roleNo44(u.role)?.let { Text(it, color = if (on) p.bg else p.mut, fontSize = 12.sp) }
                }
            }
            Btn43("Fortsett", dark = true, modifier = Modifier.fillMaxWidth(), enabled = t.ownPick != null) { t.ownStep = 1; typed = "" }
        } else {
            val u = t.ownPick ?: run { t.ownStep = 0; return@Sheet43 }
            Text("Skriv navnet til ${u.name} for å bekrefte, og passordet ditt.", color = p.mut, fontSize = 13.sp)
            Field43(typed, u.name) { typed = it }
            Field43(pw, "Passordet ditt", password = true) { pw = it }
            t.ownErr?.let { Text(it, color = RED44u, fontSize = 13.sp) }
            val ok = typed.trim().equals(u.name.trim(), ignoreCase = true)
            Btn43(if (t.ownBusy) "Overfører …" else "Overfør til ${firstName37(u.name)}", color = if (ok) RED44u else p.line, modifier = Modifier.fillMaxWidth(), enabled = ok && !t.ownBusy) {
                vm.transferOwner44(u, pw)
            }
            Btn43("Tilbake", modifier = Modifier.fillMaxWidth()) { t.ownStep = 0 }
            Text("Kan ikke angres i appen. Den nye eieren kan overføre tilbake.", color = p.mut, fontSize = 12.sp)
        }
    }
}

/** Fast stripe øverst: «Logget inn som X · Gå ut». */
@Composable
internal fun AsStripe44(vm: AppViewModel, modifier: Modifier) {
    val t = vm.p44
    if (!vm.impersonating44) return
    val name = t.asName ?: vm.account?.name ?: ""
    val c = t.asColor?.let { Color(it) } ?: Color(0xFF6B3F6E)
    Row(modifier.statusBarsPadding().padding(top = 4.dp).clip(CircleShape).background(c).padding(start = 14.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("Logget inn som ${firstName37(name)}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
        Text("Gå ut", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, modifier = Modifier.padding(start = 8.dp).heightIn(min = 40.dp).clip(CircleShape)
            .background(Color.White.copy(alpha = .18f)).clickable(role = Role.Button) { vm.exitAs44() }.padding(horizontal = 12.dp).wrapContentHeight())
    }
}

/* ======================= Profilbilde med Glimt-ring ======================= */

/** conic-gradient(from 200deg, #b23a2a, #e8794a, #f2c14e, #3fbf9a, #4f8fd6, #7a5ad6, #b23a2a). */
private val RING46 = listOf(Color(0xFFB23A2A), Color(0xFFE8794A), Color(0xFFF2C14E), Color(0xFF3FBF9A), Color(0xFF4F8FD6), Color(0xFF7A5AD6), Color(0xFFB23A2A))

/**
 * Profilknappen: 40 dp ytre, ring 2,5 dp i Glimt-fargene, 1,5 dp mellomrom i [gap] og bildet klippet til sirkel. Alle lag klippes
 * til sirkel og skyggen tegnes på en sirkel (ingen firkantet flate rundt bildet på Fold – claude-code-profilbilde-firkant-artefakt-ipad-fold.md).
 * Ringen roterer sakte (12 s) mens [busy]; «Fjern animasjoner»: statisk.
 */
@Composable
internal fun GlimtAvatar46(vm: AppViewModel, size: Dp = 40.dp, gap: Color = Color(0xFFF3EFE6), ink: Color = Color(0xFF1B1A17), busy: Boolean = false, label: String = "Innstillinger", onClick: () -> Unit) {
    val reduce = reduceMotion45()
    // Prompt 71: vinkelen som State, lest i drawBehind (tegnefasen) – profilknappen bygges ikke på nytt hvert bilde.
    val spin = if (busy && !reduce) rememberInfiniteTransition(label = "ring46").animateFloat(0f, 360f, infiniteRepeatable(tween(12_000, easing = androidx.compose.animation.core.LinearEasing)), label = "r") else null
    val inner = size - 8.dp
    Box(
        // Skyggen tegnes selv som en myk sirkel (y 2, radius 8, 25 % svart) – ikke som elevation-skygge, som i et lag med alpha
        // (Hjem-hilsenen på Fold tones med graphicsLayer) kan bli en firkantet flate.
        Modifier.size(size)
            .drawBehind {
                val r = size.toPx() / 2f
                drawCircle(Brush.radialGradient(listOf(Color.Black.copy(alpha = .25f), Color.Transparent), center = Offset(r, r + 2.dp.toPx()), radius = r + 8.dp.toPx()),
                    radius = r + 8.dp.toPx(), center = Offset(r, r + 2.dp.toPx()))
            }
            .clip(CircleShape)
            .drawBehind { rotate(110f + (spin?.value ?: 0f)) { drawCircle(Brush.sweepGradient(RING46), radius = size.toPx() / 2f + 2f) } }
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick).semantics { contentDescription = label }
            .padding(2.5.dp).clip(CircleShape).background(gap).padding(1.5.dp).clip(CircleShape),
        contentAlignment = Alignment.Center,
    ) { AvatarImage(vm, inner.value.roundToInt(), gap, ink) }
}

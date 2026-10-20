package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.DEFAULT_SERVER41
import no.kristo.finanshub.AppViewModel

/** Adressefelt: URL-tastatur uten stor forbokstav eller autokorrektur (ødelegger adressen). */
internal val ServerKeyboard = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next)
private val UserKeyboard = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, keyboardType = KeyboardType.Ascii, imeAction = ImeAction.Next)

/**
 * Innlogging og «Legg til konto»: server, brukernavn og passord → 2FA-kode når kontoen har det → innlogget.
 * Tokenet lagres kryptert; passordet lagres ikke.
 */
@Composable
internal fun LoginScreen(vm: AppViewModel) {
    // Prompt 41: ingen serverfelt som standard (https://home.kristo.no eller sist brukte). Vises bare via «Endre serveradresse».
    var server by remember { mutableStateOf(vm.server.ifBlank { DEFAULT_SERVER41 }) }
    var showServer by remember { mutableStateOf(false) }
    var user by remember { mutableStateOf("") }
    var pw by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(vm.message) { vm.message?.let { m ->
        val net = m.startsWith("Fant ikke serveren") || m.startsWith("Fikk ikke kontakt") || m.startsWith("Serveren svarte ikke") || m.startsWith("HTTPS-feil") || m.startsWith("Uventet svar")
        if (net && !showServer) { vm.p41.loginNoContact = true; vm.message = null } else { snack.showSnackbar(m); vm.message = null }
    } }
    val p = vm.pending
    Scaffold(containerColor = C.bg, snackbarHost = { SnackbarHost(snack) }) { pad ->
        Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) {
            Column(Modifier.widthIn(max = 480.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                if (vm.addingAccount || p != null) {
                    FilledTonalIconButton(onClick = { if (p != null) { vm.cancelTotp(); code = "" } else vm.addingAccount = false }, modifier = Modifier.size(48.dp)) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, if (p != null) "Tilbake" else "Avbryt")
                    }
                }
                Box(Modifier.size(56.dp).clip(RoundedCornerShape(18.dp)).background(C.accent), contentAlignment = Alignment.Center) {
                    Icon(if (p != null) Icons.Filled.Security else Icons.Filled.Savings, null, tint = tc(0xFF1A0C04))
                }
                if (p == null) {
                    Text(if (vm.addingAccount) "Legg til konto" else "FinansHub", style = MaterialTheme.typography.displaySmall)
                    Text("Logg inn på homelab-serveren din med brukernavn og passord. Appen får bare tilgang til økonomidelen.", color = C.text2)
                    if (vm.p41.loginNoContact && !showServer) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(C.surface1).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Får ikke kontakt med Homelab", fontWeight = FontWeight.Bold)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = { vm.p41.loginNoContact = false; if (pw.isNotBlank()) vm.login(server, user, pw) }) { Text("Prøv igjen", color = C.primary) }
                            TextButton(onClick = { vm.p41.loginNoContact = false; showServer = true }) { Text("Endre serveradresse") }
                        }
                    }
                    if (showServer) OutlinedTextField(server, { server = it }, label = { Text("Serveradresse") }, placeholder = { Text(DEFAULT_SERVER41) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = ServerKeyboard, shape = RoundedCornerShape(16.dp))
                    OutlinedTextField(user, { user = it }, label = { Text("Brukernavn") }, singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = UserKeyboard, shape = RoundedCornerShape(16.dp))
                    OutlinedTextField(pw, { pw = it }, label = { Text("Passord") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go), keyboardActions = KeyboardActions(onGo = { vm.login(server, user, pw) }), shape = RoundedCornerShape(16.dp))
                    Button(onClick = { vm.login(server, user, pw) }, enabled = server.isNotBlank() && pw.isNotBlank() && !vm.busy, modifier = Modifier.fillMaxWidth().height(56.dp), shape = RoundedCornerShape(28.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text(if (vm.busy) "Logger inn …" else "Logg inn", fontWeight = FontWeight.Bold) }
                    Text("Nye brukere opprettes av admin i Homelab → Innstillinger → Innlogging.", color = C.text2, fontSize = 12.sp)
                } else {
                    Text("Tofaktor", style = MaterialTheme.typography.displaySmall)
                    Text("Tofaktor er på for ${p.username.ifBlank { "kontoen" }}. Skriv inn den 6-sifrede koden fra autentiseringsappen.", color = C.text2)
                    OutlinedTextField(code, { if (it.length <= 11) code = it.filter { c -> c.isLetterOrDigit() || c == '-' } }, label = { Text("Kode") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                        textStyle = LocalTextStyle.current.copy(fontFamily = Mono, fontSize = 24.sp, letterSpacing = 6.sp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { vm.login(p.server, p.username, p.password, code) }), shape = RoundedCornerShape(16.dp),
                        supportingText = { Text("Har du mistet telefonen, kan du bruke en gjenopprettingskode.") })
                    Button(onClick = { vm.login(p.server, p.username, p.password, code) }, enabled = code.length >= 6 && !vm.busy, modifier = Modifier.fillMaxWidth().height(56.dp), shape = RoundedCornerShape(28.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text(if (vm.busy) "Bekrefter …" else "Bekreft", fontWeight = FontWeight.Bold) }
                    TextButton(onClick = { vm.cancelTotp(); code = "" }) { Text("← Tilbake", color = C.primary) }
                }
            }
        }
    }
}

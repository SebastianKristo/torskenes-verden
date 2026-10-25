package no.kristo.finanshub.wear

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Bundle
import android.speech.RecognizerIntent
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.ScalingLazyListScope
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.SwipeToDismissBox
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.material.ToggleChip
import androidx.wear.compose.material.ToggleChipDefaults
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/*
 * Prompt 51 (ANDPLAT51): Wear OS-appen «Homelab» (Gradle-modul :wear, frittstående – trenger ikke telefonen i nærheten, bare nett).
 * Sider: Hjem (Sjekk inn «Alt bra», «Hent meg», Avganger, Handleliste, Glimt) · Innlogging med QR · Bekreft «Hent meg» · Avganger ·
 * Handleliste (kryss av, legg til med tale) · Glimt (tale inn, svar som tekst) · Innstillinger (server, logg ut).
 * Navigasjon: egen stabel med SwipeToDismissBox (sveip mot høyre = tilbake; på Hjem lukker sveipet appen som vanlig).
 * Tilgjengelighet: alle knapper er Chips med tekst (TalkBack leser dem), ≥ 48 dp høye, tekst i sp (følger systemets tekststørrelse).
 */

class WearMain51 : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme { WearApp51() } }
    }
}

private class WearState51(ctx: Context) {
    var acct by mutableStateOf(WearStore51.account(ctx))
    val stack = mutableStateListOf(if (WearStore51.account(ctx) == null) "login" else "home")
    var toast by mutableStateOf<String?>(null)
    fun api(): WearApi51? = acct?.let { WearApi51(it.server, it.token) }
    fun push(p: String) { stack.add(p) }
    fun pop() { if (stack.size > 1) stack.removeAt(stack.size - 1) }
    fun reset(p: String) { stack.clear(); stack.add(p) }
}

@Composable
private fun WearApp51() {
    val ctx = LocalContext.current
    val st = remember { WearState51(ctx) }
    BackHandler(enabled = st.stack.size > 1) { st.pop() }
    val top = st.stack.last()
    val below = st.stack.getOrNull(st.stack.size - 2)
    SwipeToDismissBox(
        onDismissed = { st.pop() },
        backgroundKey = below ?: "none",
        contentKey = top,
        hasBackground = below != null,
    ) { isBackground ->
        val page = if (isBackground) below else top
        if (page != null) Page51(st, page)
    }
}

@Composable
private fun Page51(st: WearState51, page: String) {
    when (page) {
        "login" -> Login51(st)
        "pickup" -> Pickup51(st)
        "deps" -> Deps51(st)
        "list" -> Shop51(st)
        "glimt" -> Glimt51(st)
        "settings" -> Settings51(st)
        else -> Home51(st)
    }
}

/** Felles ramme: tid øverst, rullbar liste med posisjonsindikator. */
@Composable
private fun Frame51(content: ScalingLazyListScope.() -> Unit) {
    val ls = rememberScalingLazyListState()
    Scaffold(timeText = { TimeText() }, positionIndicator = { PositionIndicator(scalingLazyListState = ls) }) {
        ScalingLazyColumn(Modifier.fillMaxSize(), state = ls, content = content)
    }
}

@Composable
private fun Btn51(label: String, sub: String? = null, primary: Boolean = false, onClick: () -> Unit) {
    Chip(
        onClick = onClick,
        label = { Text(label, maxLines = 2) },
        secondaryLabel = if (sub != null) { { Text(sub, maxLines = 2) } } else null,
        colors = if (primary) ChipDefaults.primaryChipColors() else ChipDefaults.secondaryChipColors(),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun Info51(text: String) {
    Text(text, textAlign = TextAlign.Center, style = MaterialTheme.typography.body2, modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp))
}

private fun err51(e: Exception): String = when {
    e is WearApiError51 && e.status == 401 -> "Innloggingen er utløpt. Logg inn på nytt."
    e is WearApiError51 && e.status == 404 -> "Serveren mangler denne funksjonen. Oppdater Homelab."
    else -> e.message ?: "Noe gikk galt"
}

/** Siste kjente posisjon (bare når brukeren har gitt tillatelse; sendes bare med selve innsjekken). */
@SuppressLint("MissingPermission")
private fun lastFix51(ctx: Context): Location? {
    if (ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
        ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null
    val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    return runCatching {
        lm.getProviders(true).mapNotNull { p -> runCatching { lm.getLastKnownLocation(p) }.getOrNull() }.maxByOrNull { it.time }
    }.getOrNull()
}

/** Talegjenkjenning (systemets skjerm på klokka). onText får det som ble sagt. */
@Composable
private fun rememberSpeech51(onText: (String) -> Unit): (String) -> Unit {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val said = r.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.trim()
        if (!said.isNullOrBlank()) onText(said)
    }
    val ctx = LocalContext.current
    return { prompt ->
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "nb-NO")
            .putExtra(RecognizerIntent.EXTRA_PROMPT, prompt)
        try { launcher.launch(i) } catch (e: ActivityNotFoundException) {
            android.widget.Toast.makeText(ctx, "Talegjenkjenning finnes ikke på klokka", android.widget.Toast.LENGTH_LONG).show()
        }
    }
}

/* ---------------- Hjem ---------------- */

@Composable
private fun Home51(st: WearState51) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val perm = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { }
    LaunchedEffect(Unit) {
        if (ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            runCatching { perm.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION)) }
        }
    }
    Frame51 {
        item { ListHeader { Text(st.acct?.name?.takeIf { it.isNotBlank() }?.let { "Hei, $it" } ?: "Homelab") } }
        st.toast?.let { t -> item { Info51(t) } }
        item {
            Btn51(if (busy) "Sender …" else "Sjekk inn: alt bra", "Til familien", primary = true) {
                if (busy) return@Btn51
                busy = true
                scope.launch {
                    st.toast = try {
                        val api = st.api() ?: throw WearApiError51("Ikke innlogget", 401)
                        val to = api.family().map { it.id }
                        if (to.isEmpty()) "Fant ingen i familien" else {
                            val f = lastFix51(ctx)
                            api.checkin(to, "ok", f?.latitude, f?.longitude, f?.accuracy?.toDouble())
                            "Sendt: alt bra ✓"
                        }
                    } catch (e: CancellationException) { throw e } catch (e: Exception) { err51(e) }
                    busy = false
                }
            }
        }
        item { Btn51("Hent meg", "Ber familien hente deg") { st.push("pickup") } }
        item { Btn51("Avganger", "Mine stopp") { st.push("deps") } }
        item { Btn51("Handleliste", "Kryss av og legg til") { st.push("list") } }
        item { Btn51("Glimt", "Spør med stemmen") { st.push("glimt") } }
        item { Btn51("Innstillinger") { st.push("settings") } }
    }
}

/* ---------------- Hent meg (bekreft) ---------------- */

@Composable
private fun Pickup51(st: WearState51) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var msg by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    Frame51 {
        item { ListHeader { Text("Hent meg") } }
        item { Info51(msg ?: "Familien får et varsel med høy prioritet og posisjonen din nå.") }
        if (msg == null) {
            item {
                Btn51(if (busy) "Sender …" else "Send «Hent meg»", primary = true) {
                    if (busy) return@Btn51
                    busy = true
                    scope.launch {
                        msg = try {
                            val api = st.api() ?: throw WearApiError51("Ikke innlogget", 401)
                            val to = api.family().map { it.id }
                            if (to.isEmpty()) "Fant ingen i familien" else {
                                val f = lastFix51(ctx)
                                api.checkin(to, "pickup", f?.latitude, f?.longitude, f?.accuracy?.toDouble())
                                "Sendt ✓ Familien har fått beskjed."
                            }
                        } catch (e: CancellationException) { throw e } catch (e: Exception) { err51(e) }
                        busy = false
                    }
                }
            }
            item { Btn51("Avbryt") { st.pop() } }
        } else item { Btn51("Ferdig") { st.pop() } }
    }
}

/* ---------------- Avganger ---------------- */

@Composable
private fun Deps51(st: WearState51) {
    var stops by remember { mutableStateOf<List<WStop51>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableStateOf(0) }
    LaunchedEffect(tick) {
        error = null
        try { stops = st.api()?.departures() ?: emptyList() } catch (e: CancellationException) { throw e } catch (e: Exception) { error = err51(e) }
    }
    LaunchedEffect(Unit) { while (true) { delay(60_000); tick++ } }
    Frame51 {
        item { ListHeader { Text("Avganger") } }
        val s = stops
        when {
            error != null -> item { Info51(error ?: "") }
            s == null -> item { CircularProgressIndicator(Modifier.size(32.dp)) }
            s.isEmpty() -> item { Info51("Ingen stopp i Mine stopp. Legg til i appen på telefonen.") }
            else -> s.forEach { stop ->
                item { Text(stop.name, style = MaterialTheme.typography.caption1, modifier = Modifier.padding(top = 6.dp)) }
                if (stop.deps.isEmpty()) item { Info51("Ingen avganger nå") }
                stop.deps.take(4).forEach { d ->
                    item {
                        val min = when { d.minutes == null -> ""; d.minutes <= 0 -> "nå"; else -> "${d.minutes} min" }
                        Chip(onClick = { }, label = { Text("${d.line} ${d.to}", maxLines = 1) }, secondaryLabel = { Text(min + if (d.realtime) " · sanntid" else "") },
                            colors = ChipDefaults.secondaryChipColors(), modifier = Modifier.fillMaxWidth())
                    }
                }
            }
        }
        item { Btn51("Oppdater") { tick++ } }
    }
}

/* ---------------- Handleliste ---------------- */

@Composable
private fun Shop51(st: WearState51) {
    val scope = rememberCoroutineScope()
    var list by remember { mutableStateOf<String?>(null) }
    var items by remember { mutableStateOf<List<WItem51>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableStateOf(0) }
    LaunchedEffect(tick) {
        try {
            val api = st.api() ?: return@LaunchedEffect
            if (list == null) list = api.shoppingList()
            items = api.items(list)
            error = null
        } catch (e: CancellationException) { throw e } catch (e: Exception) { error = err51(e) }
    }
    val speak = rememberSpeech51 { said ->
        scope.launch {
            try {
                val api = st.api() ?: return@launch
                said.split(Regex("""\s*(,|\bog\b)\s*""")).map { it.trim() }.filter { it.isNotBlank() }.take(6).forEach { t ->
                    api.add(list, t.replaceFirstChar { it.uppercase() })
                }
                tick++
            } catch (e: CancellationException) { throw e } catch (e: Exception) { error = err51(e) }
        }
    }
    Frame51 {
        item { ListHeader { Text("Handleliste") } }
        item { Btn51("Legg til med stemmen", "F.eks. «melk og egg»", primary = true) { speak("Hva skal på lista?") } }
        error?.let { e -> item { Info51(e) } }
        val l = items
        when {
            l == null && error == null -> item { CircularProgressIndicator(Modifier.size(32.dp)) }
            l != null && l.isEmpty() -> item { Info51("Lista er tom") }
            l != null -> l.forEach { it0 ->
                item {
                    ToggleChip(
                        checked = it0.done,
                        onCheckedChange = { v ->
                            items = items?.map { x -> if (x.id == it0.id) x.copy(done = v) else x }
                            scope.launch {
                                try { st.api()?.setDone(it0.id, v) } catch (e: CancellationException) { throw e } catch (e: Exception) { error = err51(e); tick++ }
                            }
                        },
                        label = { Text(it0.title, maxLines = 2) },
                        toggleControl = { androidx.wear.compose.material.Icon(imageVector = ToggleChipDefaults.checkboxIcon(it0.done), contentDescription = if (it0.done) "Kjøpt" else "Ikke kjøpt") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}

/* ---------------- Glimt ---------------- */

@Composable
private fun Glimt51(st: WearState51) {
    val scope = rememberCoroutineScope()
    var asked by remember { mutableStateOf<String?>(null) }
    var answer by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val speak = rememberSpeech51 { said ->
        asked = said; answer = null; busy = true
        scope.launch {
            answer = try { st.api()?.glimt(said) ?: "Ikke innlogget" } catch (e: CancellationException) { throw e } catch (e: Exception) { err51(e) }
            busy = false
        }
    }
    Frame51 {
        item { ListHeader { Text("Glimt") } }
        item { Btn51(if (asked == null) "Snakk til Glimt" else "Spør igjen", primary = true) { if (!busy) speak("Spør Glimt") } }
        asked?.let { q -> item { Text("«$q»", style = MaterialTheme.typography.caption1, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) } }
        if (busy) item { CircularProgressIndicator(Modifier.size(32.dp)) }
        answer?.let { a -> item { Info51(a) } }
    }
}

/* ---------------- Innstillinger ---------------- */

@Composable
private fun Settings51(st: WearState51) {
    val ctx = LocalContext.current
    Frame51 {
        item { ListHeader { Text("Innstillinger") } }
        item { Info51("Server: " + (st.acct?.server ?: WearStore51.server(ctx)).substringAfter("://")) }
        item { Info51("Innlogget som " + (st.acct?.name?.ifBlank { null } ?: "–")) }
        item {
            Btn51("Logg ut") {
                WearStore51.logout(ctx); st.acct = null; st.reset("login")
            }
        }
    }
}

/* ---------------- Innlogging med QR ---------------- */

@Composable
private fun Login51(st: WearState51) {
    val ctx = LocalContext.current
    var server by remember { mutableStateOf(WearStore51.server(ctx)) }
    var editing by remember { mutableStateOf(false) }
    var qr by remember { mutableStateOf<WQr51?>(null) }
    var status by remember { mutableStateOf("Henter kode …") }
    var round by remember { mutableStateOf(0) }
    LaunchedEffect(server, round, editing) {
        if (editing) return@LaunchedEffect
        val api = WearApi51(server, null)
        while (true) {
            val q = try { api.qrStart() } catch (e: CancellationException) { throw e } catch (e: Exception) { qr = null; status = err51(e); return@LaunchedEffect }
            qr = q; status = "Skann med FinansHub på telefonen: Mer → Logg inn på annen enhet"
            var done = false
            while (!done && System.currentTimeMillis() < q.expires + 30_000) {
                delay(2_000)
                val o = try { api.qrPoll(q) } catch (e: CancellationException) { throw e } catch (e: Exception) { null } ?: continue
                val tok = o.optString("token").takeIf { it.isNotBlank() }
                if (tok != null) {
                    val u = o.optJSONObject("user")
                    val name = u?.optString("name")?.ifBlank { null } ?: u?.optString("displayName")?.ifBlank { null } ?: u?.optString("username").orEmpty()
                    val a = WAcct51(server, tok, name)
                    WearStore51.save(ctx, a)
                    st.acct = a
                    st.reset("home")
                    return@LaunchedEffect
                }
                when (o.optString("state")) {
                    "scanned" -> status = "Skannet" + (o.optString("match").takeIf { it.isNotBlank() }?.let { " · tallet er $it" } ?: "") + ". Godkjenn på telefonen."
                    "denied" -> { status = "Avvist på telefonen"; delay(2_500); done = true }
                    "expired", "done" -> done = true
                }
            }
        }
    }
    if (editing) {
        Box(Modifier.fillMaxSize().background(Color.Black).padding(24.dp), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Serveradresse", style = MaterialTheme.typography.caption1)
                var txt by remember { mutableStateOf(server.substringAfter("://")) }
                BasicTextField(txt, { txt = it }, singleLine = true,
                    textStyle = TextStyle(color = Color.White, fontSize = 14.sp, textAlign = TextAlign.Center),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp).background(Color(0xFF2B2B2B)).padding(8.dp).semantics { contentDescription = "Serveradresse" })
                Chip(onClick = { WearStore51.setServer(ctx, txt); server = WearStore51.server(ctx); editing = false; round++ },
                    label = { Text("Lagre") }, colors = ChipDefaults.primaryChipColors())
            }
        }
        return
    }
    Frame51 {
        item { ListHeader { Text("Logg inn") } }
        item {
            val q = qr
            if (q == null) CircularProgressIndicator(Modifier.size(32.dp))
            else QrBox51(q.payload)
        }
        item { Info51(status) }
        item { Btn51("Ny kode") { round++ } }
        item { Btn51("Server", server.substringAfter("://")) { editing = true } }
    }
}

@Composable
private fun QrBox51(payload: String) {
    val m = remember(payload) { runCatching { WearQr51.matrix(payload) }.getOrNull() }
    if (m == null) { Info51("Kunne ikke lage QR-kode"); return }
    Box(Modifier.size(150.dp).background(Color.White).padding(6.dp).semantics { contentDescription = "QR-kode for innlogging. Skann med FinansHub på telefonen." }) {
        Canvas(Modifier.fillMaxSize()) {
            val n = m.size
            val cell = size.minDimension / n
            for (y in 0 until n) for (x in 0 until n) if (m[y][x]) drawRect(Color.Black, Offset(x * cell, y * cell), Size(cell + 0.5f, cell + 0.5f))
        }
    }
}

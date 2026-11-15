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
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.wear.compose.material.Colors
import no.kristo.finanshub.wear.ui.designsystem.DsPalette
import no.kristo.finanshub.wear.ui.designsystem.DsText
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

/*
 * Prompt 51 (ANDPLAT51): Wear OS-appen «Homelab» (Gradle-modul :wear, frittstående – trenger ikke telefonen i nærheten, bare nett).
 * Sider: Hjem (Sjekk inn «Alt bra», «Hent meg», Avganger, Handleliste, Glimt, Media) · Media (spilles nå med pause/neste/stopp, MEDCTL51) · Innlogging med QR · Bekreft «Hent meg» · Avganger ·
 * Handleliste (kryss av, legg til med tale) · Glimt (tale inn, svar som tekst) · Innstillinger (server, logg ut).
 * Navigasjon: egen stabel med SwipeToDismissBox (sveip mot høyre = tilbake; på Hjem lukker sveipet appen som vanlig).
 * Tilgjengelighet: alle knapper er Chips med tekst (TalkBack leser dem), ≥ 48 dp høye, tekst i sp (følger systemets tekststørrelse).
 */

class WearMain51 : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme(colors = wearFarger) { WearRot() } }
    }
}

/**
 * Fargene fra designtokenene (shared/design/tokens.json → ui/designsystem/DesignTokens.kt), Papir mørk: klokka har alltid svart
 * bakgrunn. Primærfargen (knapper som «Alt bra» og «Lagre») er Homelab-aksenten.
 */
private val wearFarger = Colors(
    primary = DsPalette.PapirMork.accent,
    primaryVariant = DsPalette.PapirMork.accent,
    secondary = DsPalette.PapirMork.info,
    secondaryVariant = DsPalette.PapirMork.info,
    background = Color.Black,
    surface = DsPalette.PapirMork.surfaceRaised,
    error = DsPalette.PapirMork.danger,
    onPrimary = DsPalette.PapirMork.onAccent,
    onSecondary = DsPalette.PapirMork.onInfo,
    onBackground = DsPalette.PapirMork.textPrimary,
    onSurface = DsPalette.PapirMork.textPrimary,
    onSurfaceVariant = DsPalette.PapirMork.textSecondary,
    onError = DsPalette.PapirMork.onDanger,
)

/** Sant for siden som vises øverst (ikke den som ligger bak under sveip-tilbake). Bare den tar imot krona. */
private val LocalForgrunn = staticCompositionLocalOf { true }

private class WearState(ctx: Context) {
    var acct by mutableStateOf(WearStore.account(ctx))
    val stack = mutableStateListOf(if (WearStore.account(ctx) == null) "login" else "home")
    var toast by mutableStateOf<String?>(null)
    fun api(): WearApi? = acct?.let { WearApi(it.server, it.token) }
    fun push(p: String) { stack.add(p) }
    fun pop() { if (stack.size > 1) stack.removeAt(stack.size - 1) }
    fun reset(p: String) { stack.clear(); stack.add(p) }
}

@Composable
private fun WearRot() {
    val ctx = LocalContext.current
    val st = remember { WearState(ctx) }
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
        if (page != null) CompositionLocalProvider(LocalForgrunn provides !isBackground) { Side(st, page) }
    }
}

@Composable
private fun Side(st: WearState, page: String) {
    when (page) {
        "login" -> InnloggingSide(st)
        "pickup" -> HentMegSide(st)
        "deps" -> AvgangerSide(st)
        "list" -> HandlelisteSide(st)
        "glimt" -> GlimtSide(st)
        "settings" -> InnstillingerSide(st)
        "media" -> MediaSide(st)
        else -> HjemSide(st)
    }
}

/**
 * Felles ramme: tid øverst, rullbar liste med posisjonsindikator. Krona / den roterende rammen ruller lista: siden i forgrunnen
 * ber om fokus, og rotasjonen gis videre til lista (onRotaryScrollEvent fra Compose UI, ingen ny avhengighet).
 */
@Composable
private fun Ramme(content: ScalingLazyListScope.() -> Unit) {
    val ls = rememberScalingLazyListState()
    val fokus = remember { FocusRequester() }
    val scope = rememberCoroutineScope()
    val forgrunn = LocalForgrunn.current
    Scaffold(timeText = { TimeText() }, positionIndicator = { PositionIndicator(scalingLazyListState = ls) }) {
        ScalingLazyColumn(
            Modifier.fillMaxSize()
                .onRotaryScrollEvent { e -> scope.launch { ls.scrollBy(e.verticalScrollPixels) }; true }
                .focusRequester(fokus)
                .focusable(),
            state = ls, content = content,
        )
    }
    LaunchedEffect(forgrunn) { if (forgrunn) runCatching { fokus.requestFocus() } }
}

/**
 * Kjører [steg] hvert [ms] mens appen er synlig (minst STARTED). Når skjermen slukkes eller appen legges bort, stopper
 * hentingen; når den vises igjen, kjøres [steg] med en gang og så videre hvert [ms].
 */
@Composable
private fun GjentaMensSynlig(ms: Long, steg: () -> Unit) {
    val eier = LocalLifecycleOwner.current
    val gjeldende by rememberUpdatedState(steg)
    var synlig by remember { mutableStateOf(eier.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) }
    DisposableEffect(eier) {
        val obs = LifecycleEventObserver { _, _ -> synlig = eier.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED) }
        eier.lifecycle.addObserver(obs)
        onDispose { eier.lifecycle.removeObserver(obs) }
    }
    var startet by remember { mutableStateOf(false) }
    LaunchedEffect(synlig) {
        if (!synlig) return@LaunchedEffect
        if (startet) gjeldende()
        startet = true
        while (true) { delay(ms); gjeldende() }
    }
}

@Composable
private fun Knapp(label: String, sub: String? = null, primary: Boolean = false, onClick: () -> Unit) {
    Chip(
        onClick = onClick,
        label = { Text(label, maxLines = 2) },
        secondaryLabel = if (sub != null) { { Text(sub, maxLines = 2) } } else null,
        colors = if (primary) ChipDefaults.primaryChipColors() else ChipDefaults.secondaryChipColors(),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun Info(text: String) {
    Text(text, textAlign = TextAlign.Center, style = MaterialTheme.typography.body2, modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp))
}

private fun feilmelding(e: Exception): String = when {
    e is WearApiFeil && e.status == 401 -> "Innloggingen er utløpt. Logg inn på nytt."
    e is WearApiFeil && e.status == 404 -> "Serveren mangler denne funksjonen. Oppdater Homelab."
    else -> e.message ?: "Noe gikk galt"
}

/** Siste kjente posisjon (bare når brukeren har gitt tillatelse; sendes bare med selve innsjekken). */
@SuppressLint("MissingPermission")
private fun sistePosisjon(ctx: Context): Location? {
    if (ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
        ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null
    val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    return runCatching {
        lm.getProviders(true).mapNotNull { p -> runCatching { lm.getLastKnownLocation(p) }.getOrNull() }.maxByOrNull { it.time }
    }.getOrNull()
}

/** Talegjenkjenning (systemets skjerm på klokka). onText får det som ble sagt. */
@Composable
private fun rememberTale(onText: (String) -> Unit): (String) -> Unit {
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
private fun HjemSide(st: WearState) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val perm = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { }
    LaunchedEffect(Unit) {
        if (ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            runCatching { perm.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION)) }
        }
    }
    Ramme {
        item { ListHeader { Text(st.acct?.name?.takeIf { it.isNotBlank() }?.let { "Hei, $it" } ?: "Homelab") } }
        st.toast?.let { t -> item { Info(t) } }
        item {
            Knapp(if (busy) "Sender …" else "Sjekk inn: alt bra", "Til familien", primary = true) {
                if (busy) return@Knapp
                busy = true
                scope.launch {
                    st.toast = try {
                        val api = st.api() ?: throw WearApiFeil("Ikke innlogget", 401)
                        val to = api.family().map { it.id }
                        if (to.isEmpty()) "Fant ingen i familien" else {
                            val f = sistePosisjon(ctx)
                            api.checkin(to, "ok", f?.latitude, f?.longitude, f?.accuracy?.toDouble())
                            "Sendt: alt bra ✓"
                        }
                    } catch (e: CancellationException) { throw e } catch (e: Exception) { feilmelding(e) }
                    busy = false
                }
            }
        }
        item { Knapp("Hent meg", "Ber familien hente deg") { st.push("pickup") } }
        item { Knapp("Avganger", "Mine stopp") { st.push("deps") } }
        item { Knapp("Handleliste", "Kryss av og legg til") { st.push("list") } }
        item { Knapp("Glimt", "Spør med stemmen") { st.push("glimt") } }
        item { Knapp("Media", "Spilles nå: pause, neste, stopp") { st.push("media") } }
        item { Knapp("Innstillinger") { st.push("settings") } }
    }
}

/* ---------------- Hent meg (bekreft) ---------------- */

@Composable
private fun HentMegSide(st: WearState) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var msg by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    Ramme {
        item { ListHeader { Text("Hent meg") } }
        item { Info(msg ?: "Familien får et varsel med høy prioritet og posisjonen din nå.") }
        if (msg == null) {
            item {
                Knapp(if (busy) "Sender …" else "Send «Hent meg»", primary = true) {
                    if (busy) return@Knapp
                    busy = true
                    scope.launch {
                        msg = try {
                            val api = st.api() ?: throw WearApiFeil("Ikke innlogget", 401)
                            val to = api.family().map { it.id }
                            if (to.isEmpty()) "Fant ingen i familien" else {
                                val f = sistePosisjon(ctx)
                                api.checkin(to, "pickup", f?.latitude, f?.longitude, f?.accuracy?.toDouble())
                                "Sendt ✓ Familien har fått beskjed."
                            }
                        } catch (e: CancellationException) { throw e } catch (e: Exception) { feilmelding(e) }
                        busy = false
                    }
                }
            }
            item { Knapp("Avbryt") { st.pop() } }
        } else item { Knapp("Ferdig") { st.pop() } }
    }
}

/* ---------------- Avganger ---------------- */

@Composable
private fun AvgangerSide(st: WearState) {
    var stops by remember { mutableStateOf<List<WStopp>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableStateOf(0) }
    LaunchedEffect(tick) {
        error = null
        try { stops = st.api()?.departures() ?: emptyList() } catch (e: CancellationException) { throw e } catch (e: Exception) { error = feilmelding(e) }
    }
    GjentaMensSynlig(60_000) { tick++ }
    Ramme {
        item { ListHeader { Text("Avganger") } }
        val s = stops
        when {
            error != null -> item { Info(error ?: "") }
            s == null -> item { CircularProgressIndicator(Modifier.size(32.dp)) }
            s.isEmpty() -> item { Info("Ingen stopp i Mine stopp. Legg til i appen på telefonen.") }
            else -> s.forEach { stop ->
                item { Text(stop.name, style = MaterialTheme.typography.caption1, modifier = Modifier.padding(top = 6.dp)) }
                if (stop.deps.isEmpty()) item { Info("Ingen avganger nå") }
                stop.deps.take(4).forEach { d ->
                    item {
                        val min = when { d.minutes == null -> ""; d.minutes <= 0 -> "nå"; else -> "${d.minutes} min" }
                        Chip(onClick = { }, label = { Text("${d.line} ${d.to}", maxLines = 1) }, secondaryLabel = { Text(min + if (d.realtime) " · sanntid" else "") },
                            colors = ChipDefaults.secondaryChipColors(), modifier = Modifier.fillMaxWidth())
                    }
                }
            }
        }
        item { Knapp("Oppdater") { tick++ } }
    }
}

/* ---------------- Media (MEDCTL51) ---------------- */

@Composable
private fun MediaSide(st: WearState) {
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<WAvspilling>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var msg by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var tick by remember { mutableStateOf(0) }
    LaunchedEffect(tick) {
        error = null
        try { items = st.api()?.nowPlaying() ?: emptyList() } catch (e: CancellationException) { throw e } catch (e: Exception) { error = feilmelding(e) }
    }
    GjentaMensSynlig(15_000) { tick++ }
    fun cmd(p: WAvspilling, action: String, body: org.json.JSONObject = org.json.JSONObject()) {
        if (busy) return
        busy = true
        scope.launch {
            msg = try {
                val api = st.api() ?: throw WearApiFeil("Ikke innlogget", 401)
                val n = api.control(p.id, action, body)
                items = items?.mapNotNull { if (it.id == p.id) n else it }
                when { n == null -> "Stoppet"; action == "toggle" -> if (n.paused) "Satt på pause" else "Spiller"; else -> "OK" }
            } catch (e: CancellationException) { throw e } catch (e: Exception) { feilmelding(e) }
            busy = false
        }
    }
    Ramme {
        item { ListHeader { Text("Spilles nå") } }
        msg?.let { t -> item { Info(t) } }
        val list = items
        when {
            error != null -> item { Info(error ?: "") }
            list == null -> item { CircularProgressIndicator(Modifier.size(32.dp)) }
            list.isEmpty() -> item { Info("Ingenting spilles nå.") }
            else -> list.forEach { p ->
                item { Text(p.title, style = MaterialTheme.typography.title3, maxLines = 2, modifier = Modifier.padding(top = 6.dp)) }
                if (p.sub.isNotBlank()) item { Text(p.sub, style = MaterialTheme.typography.caption1, maxLines = 2) }
                if (p.controls.isEmpty()) item { Info(p.note ?: "Kan ikke styres herfra") }
                if ("playpause" in p.controls) item { Knapp(if (p.paused) "Spill av" else "Pause", primary = true) { cmd(p, "toggle") } }
                if ("next" in p.controls) item { Knapp("Neste") { cmd(p, "next") } }
                if ("seek" in p.controls) item { Knapp("Spol 30 s tilbake") { cmd(p, "seek", org.json.JSONObject().put("offset", -30_000)) } }
                if ("stop" in p.controls) item { Knapp("Stopp") { cmd(p, "stop") } }
            }
        }
        item { Knapp("Oppdater") { tick++ } }
    }
}

/* ---------------- Handleliste ---------------- */

@Composable
private fun HandlelisteSide(st: WearState) {
    val scope = rememberCoroutineScope()
    var list by remember { mutableStateOf<String?>(null) }
    var items by remember { mutableStateOf<List<WVare>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableStateOf(0) }
    LaunchedEffect(tick) {
        try {
            val api = st.api() ?: return@LaunchedEffect
            if (list == null) list = api.shoppingList()
            items = api.items(list)
            error = null
        } catch (e: CancellationException) { throw e } catch (e: Exception) { error = feilmelding(e) }
    }
    val speak = rememberTale { said ->
        scope.launch {
            try {
                val api = st.api() ?: return@launch
                said.split(Regex("""\s*(,|\bog\b)\s*""")).map { it.trim() }.filter { it.isNotBlank() }.take(6).forEach { t ->
                    api.add(list, t.replaceFirstChar { it.uppercase() })
                }
                tick++
            } catch (e: CancellationException) { throw e } catch (e: Exception) { error = feilmelding(e) }
        }
    }
    Ramme {
        item { ListHeader { Text("Handleliste") } }
        item { Knapp("Legg til med stemmen", "F.eks. «melk og egg»", primary = true) { speak("Hva skal på lista?") } }
        error?.let { e -> item { Info(e) } }
        val l = items
        when {
            l == null && error == null -> item { CircularProgressIndicator(Modifier.size(32.dp)) }
            l != null && l.isEmpty() -> item { Info("Lista er tom") }
            l != null -> l.forEach { it0 ->
                item {
                    ToggleChip(
                        checked = it0.done,
                        onCheckedChange = { v ->
                            items = items?.map { x -> if (x.id == it0.id) x.copy(done = v) else x }
                            scope.launch {
                                try { st.api()?.setDone(it0.id, v) } catch (e: CancellationException) { throw e } catch (e: Exception) { error = feilmelding(e); tick++ }
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
private fun GlimtSide(st: WearState) {
    val scope = rememberCoroutineScope()
    var asked by remember { mutableStateOf<String?>(null) }
    var answer by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val speak = rememberTale { said ->
        asked = said; answer = null; busy = true
        scope.launch {
            answer = try { st.api()?.glimt(said) ?: "Ikke innlogget" } catch (e: CancellationException) { throw e } catch (e: Exception) { feilmelding(e) }
            busy = false
        }
    }
    Ramme {
        item { ListHeader { Text("Glimt") } }
        item { Knapp(if (asked == null) "Snakk til Glimt" else "Spør igjen", primary = true) { if (!busy) speak("Spør Glimt") } }
        asked?.let { q -> item { Text("«$q»", style = MaterialTheme.typography.caption1, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) } }
        if (busy) item { CircularProgressIndicator(Modifier.size(32.dp)) }
        answer?.let { a -> item { Info(a) } }
    }
}

/* ---------------- Innstillinger ---------------- */

@Composable
private fun InnstillingerSide(st: WearState) {
    val ctx = LocalContext.current
    Ramme {
        item { ListHeader { Text("Innstillinger") } }
        item { Info("Server: " + (st.acct?.server ?: WearStore.server(ctx)).substringAfter("://")) }
        item { Info("Innlogget som " + (st.acct?.name?.ifBlank { null } ?: "–")) }
        item {
            Knapp("Logg ut") {
                WearStore.logout(ctx); st.acct = null; st.reset("login")
            }
        }
    }
}

/* ---------------- Innlogging med QR ---------------- */

@Composable
private fun InnloggingSide(st: WearState) {
    val ctx = LocalContext.current
    var server by remember { mutableStateOf(WearStore.server(ctx)) }
    var editing by remember { mutableStateOf(false) }
    var qr by remember { mutableStateOf<WQrOkt?>(null) }
    var status by remember { mutableStateOf("Henter kode …") }
    var round by remember { mutableStateOf(0) }
    LaunchedEffect(server, round, editing) {
        if (editing) return@LaunchedEffect
        val api = WearApi(server, null)
        while (true) {
            val q = try { api.qrStart() } catch (e: CancellationException) { throw e } catch (e: Exception) { qr = null; status = feilmelding(e); return@LaunchedEffect }
            qr = q; status = "Skann med Homelab-appen på telefonen: Mer → Logg inn på annen enhet"
            var done = false
            while (!done && System.currentTimeMillis() < q.expires + 30_000) {
                delay(2_000)
                val o = try { api.qrPoll(q) } catch (e: CancellationException) { throw e } catch (e: Exception) { null } ?: continue
                val tok = o.optString("token").takeIf { it.isNotBlank() }
                if (tok != null) {
                    val u = o.optJSONObject("user")
                    val name = u?.optString("name")?.ifBlank { null } ?: u?.optString("displayName")?.ifBlank { null } ?: u?.optString("username").orEmpty()
                    val a = WKonto(server, tok, name)
                    WearStore.save(ctx, a)
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
                    textStyle = TextStyle(color = DsPalette.PapirMork.textPrimary, fontSize = DsText.callout.fontSize, textAlign = TextAlign.Center),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp).background(DsPalette.PapirMork.surfaceChip).padding(8.dp).semantics { contentDescription = "Serveradresse" })
                Chip(onClick = { WearStore.setServer(ctx, txt); server = WearStore.server(ctx); editing = false; round++ },
                    label = { Text("Lagre") }, colors = ChipDefaults.primaryChipColors())
            }
        }
        return
    }
    Ramme {
        item { ListHeader { Text("Logg inn") } }
        item {
            val q = qr
            if (q == null) CircularProgressIndicator(Modifier.size(32.dp))
            else QrBoks(q.payload)
        }
        item { Info(status) }
        item { Knapp("Ny kode") { round++ } }
        item { Knapp("Server", server.substringAfter("://")) { editing = true } }
    }
}

@Composable
private fun QrBoks(payload: String) {
    val m = remember(payload) { runCatching { WearQr.matrix(payload) }.getOrNull() }
    if (m == null) { Info("Kunne ikke lage QR-kode"); return }
    Box(Modifier.size(150.dp).background(Color.White).padding(6.dp).semantics { contentDescription = "QR-kode for innlogging. Skann med Homelab-appen på telefonen." }) {
        Canvas(Modifier.fillMaxSize()) {
            val n = m.size
            val cell = size.minDimension / n
            for (y in 0 until n) for (x in 0 until n) if (m[y][x]) drawRect(Color.Black, Offset(x * cell, y * cell), Size(cell + 0.5f, cell + 0.5f))
        }
    }
}

package no.kristo.finanshub

import android.content.Intent
import android.content.pm.ApplicationInfo
import androidx.car.app.CarAppService
import androidx.car.app.CarContext
import androidx.car.app.CarToast
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.model.Action
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.MessageTemplate
import androidx.car.app.model.Pane
import androidx.car.app.model.PaneTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.car.app.validation.HostValidator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

/*
 * Prompt 51 (ANDPLAT51): Android Auto (Car App Library, kategori POI) i :app – tre maler, ingen egen innlogging:
 *  - «Avganger»: Mine stopp (/api/me/stops, maks 4) → de neste avgangene (/api/ruter/departures?stop=…&n=6).
 *  - «På vei hjem»: reisen hjem nå (/api/ruter/my-trip?dir=toHome) og «Si fra til familien» (innsjekk «På vei hjem» til familien,
 *    posisjonen bare med denne innsjekken; uten nett i offline-køen).
 *  - «Media»: hva som spilles nå (/api/playback/sessions) og «Fortsett» fra Audiobookshelf (/api/media51/audio/continue).
 *    Bare visning: serveren har ingen API for å styre avspillingen (play/pause) ennå – se docs/android-plattform-51.md.
 * Kontoen er den aktive i appen (bgApi41). Uten innlogging vises en melding. Ingen tekstfelt eller lange lister (bilmalenes grenser:
 * maks 6 rader per liste). Sideloadet app: Android Auto → Utviklerinnstillinger → «Ukjente kilder» må være på (se dokumentasjonen).
 */

class Car51Service : CarAppService() {
    override fun createHostValidator(): HostValidator {
        val debug = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        return if (debug) HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
        else HostValidator.Builder(applicationContext).addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample).build()
    }

    override fun onCreateSession(): Session = Car51Session()
}

class Car51Session : Session() {
    override fun onCreateScreen(intent: Intent): Screen = Car51Home(carContext)
}

/** Felles: bakgrunnskall, feiltekst og «ikke innlogget». */
abstract class Car51Base(ctx: CarContext) : Screen(ctx) {
    protected val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    protected var loading = true
    protected var error: String? = null

    protected fun api(): Api? = bgApi41(carContext)

    protected fun load(block: suspend (Api) -> Unit) {
        val api = api() ?: run { loading = false; error = "Logg inn i FinansHub på telefonen først."; return }
        loading = true
        scope.launch {
            try { withContext(Dispatchers.IO) { block(api) }; error = null } catch (e: ApiException) {
                error = if (Offline51.isOffline(e)) "Ingen kontakt med serveren." else e.message ?: "Noe gikk galt"
            } catch (e: Exception) { error = e.message ?: "Noe gikk galt" }
            loading = false
            invalidate()
        }
    }

    protected fun message(title: String, text: String): Template =
        MessageTemplate.Builder(text).setTitle(title).setHeaderAction(Action.BACK)
            .addAction(Action.Builder().setTitle("Prøv igjen").setOnClickListener { error = null; reload() }.build()).build()

    protected open fun reload() {}

    protected fun row(title: String, vararg lines: String?): Row.Builder = Row.Builder().setTitle(title.ifBlank { "–" }).apply {
        lines.filterNotNull().filter { it.isNotBlank() }.take(2).forEach { addText(it) }
    }
}

class Car51Home(ctx: CarContext) : Car51Base(ctx) {
    init { loading = false }
    override fun onGetTemplate(): Template {
        val list = ItemList.Builder()
            .addItem(row("Avganger", "Mine stopp").setBrowsable(true).setOnClickListener { screenManager.push(Car51Deps(carContext)) }.build())
            .addItem(row("På vei hjem", "Reisen hjem og «Si fra til familien»").setBrowsable(true).setOnClickListener { screenManager.push(Car51Trip(carContext)) }.build())
            .addItem(row("Media", "Spilles nå og Fortsett").setBrowsable(true).setOnClickListener { screenManager.push(Car51Media(carContext)) }.build())
            .build()
        return ListTemplate.Builder().setTitle(carContext.getString(R.string.car51_name)).setHeaderAction(Action.APP_ICON).setSingleList(list).build()
    }
}

/* ---------------- Avganger ---------------- */

class Car51Deps(ctx: CarContext) : Car51Base(ctx) {
    private var stops: List<StopDeps> = emptyList()
    init { reload() }

    override fun reload() = load { api ->
        val mine = parseStopList(api.hlGet("/me/stops", timeout = 8_000)).take(4)
        stops = mine.mapNotNull { st ->
            runCatching {
                val sd = parseStopDeps(api.hlGet("/ruter/departures?stop=" + URLEncoder.encode(st.id, "UTF-8") + "&n=6", timeout = 12_000))
                sd.copy(stop = sd.stop.copy(id = st.id, name = st.name.ifBlank { sd.stop.name }))
            }.getOrNull()
        }
    }

    override fun onGetTemplate(): Template {
        error?.let { return message("Avganger", it) }
        val b = ListTemplate.Builder().setTitle("Avganger").setHeaderAction(Action.BACK)
        if (loading) return b.setLoading(true).build()
        if (stops.isEmpty()) return message("Avganger", "Ingen stopp i Mine stopp. Legg til stopp i appen (Avganger).")
        val list = ItemList.Builder()
        stops.take(6).forEach { sd ->
            val next = sd.departures.filter { !it.cancelled }.take(3).joinToString("  ·  ") { d -> "${d.line} ${d.to.take(14)} ${car51Min(d.minutes)}" }
            list.addItem(row(sd.stop.name, next.ifBlank { "Ingen avganger nå" }).setBrowsable(true)
                .setOnClickListener { screenManager.push(Car51Stop(carContext, sd)) }.build())
        }
        return b.setSingleList(list.build())
            .setActionStrip(androidx.car.app.model.ActionStrip.Builder().addAction(Action.Builder().setTitle("Oppdater").setOnClickListener { reload(); invalidate() }.build()).build())
            .build()
    }
}

internal fun car51Min(m: Int?): String = when { m == null -> ""; m <= 0 -> "nå"; else -> "$m min" }

class Car51Stop(ctx: CarContext, private val sd: StopDeps) : Car51Base(ctx) {
    init { loading = false }
    override fun onGetTemplate(): Template {
        val list = ItemList.Builder()
        val deps = sd.departures.filter { !it.cancelled }.take(6)
        if (deps.isEmpty()) return message(sd.stop.name, "Ingen avganger de neste minuttene.")
        deps.forEach { d ->
            list.addItem(row("${d.line} ${d.to}", listOfNotNull(car51Min(d.minutes).ifBlank { null }, if (d.realtime) "sanntid" else "rutetid", d.platform?.let { "spor $it" }).joinToString(" · ")).build())
        }
        return ListTemplate.Builder().setTitle(sd.stop.name).setHeaderAction(Action.BACK).setSingleList(list.build()).build()
    }
}

/* ---------------- På vei hjem ---------------- */

class Car51Trip(ctx: CarContext) : Car51Base(ctx) {
    private var trip: Trip41? = null
    private var people: List<String> = emptyList()
    private var sent = false
    init { reload() }

    override fun reload() = load { api ->
        trip = runCatching { parseTrip41(api.hlGet("/ruter/my-trip?dir=toHome", timeout = 12_000)) }.getOrNull()
        people = runCatching {
            val o = JSONObject(api.hlGet("/family/checkin", timeout = 10_000))
            val a = o.optJSONArray("people") ?: JSONArray()
            (0 until a.length()).mapNotNull { a.optJSONObject(it) }.filter { !it.optBoolean("self") }
                .mapNotNull { it.optString("userId").ifBlank { it.optString("id") }.takeIf { s -> s.isNotBlank() } }
        }.getOrDefault(emptyList())
    }

    private fun hhmm(s: String?): String? = s?.let { if (it.contains('T')) it.substringAfter('T').take(5) else it.take(5) }

    private fun sendHome() {
        val api = api() ?: return
        if (people.isEmpty()) { CarToast.makeText(carContext, "Fant ingen i familien å si fra til", CarToast.LENGTH_LONG).show(); return }
        val opt = trip?.options?.firstOrNull { it.preferred } ?: trip?.options?.firstOrNull()
        val b = JSONObject().put("to", JSONArray(people)).put("text", "På vei hjem" + (hhmm(opt?.arr)?.let { ", hjemme ca. $it" } ?: ""))
        lastFix50(carContext)?.let { b.put("lat", it.latitude).put("lon", it.longitude).put("acc", it.accuracy.toDouble()) }
        scope.launch {
            val msg = try {
                if (withContext(Dispatchers.IO) { sendOrQueue51(carContext, api, "POST", "/family/checkin", b, "Sjekk inn: på vei hjem", kind = "checkin") }) "Familien har fått beskjed"
                else "Ingen nett – sendes når du har dekning"
            } catch (e: ApiException) { e.message ?: "Fikk ikke sendt" }
            sent = true
            CarToast.makeText(carContext, msg, CarToast.LENGTH_LONG).show()
            invalidate()
        }
    }

    override fun onGetTemplate(): Template {
        error?.let { return message("På vei hjem", it) }
        val pane = Pane.Builder()
        if (loading) return PaneTemplate.Builder(pane.setLoading(true).build()).setTitle("På vei hjem").setHeaderAction(Action.BACK).build()
        val t = trip
        val opts = t?.options.orEmpty().take(3)
        if (t?.alert != null && t.alert.text.isNotBlank()) pane.addRow(row(t.alert.text, t.alert.body).build())
        if (opts.isEmpty()) pane.addRow(row("Fant ingen reise hjem nå", "Sett hjem i Familie › Steder i appen").build())
        opts.forEach { o ->
            val legs = o.legs.filter { it.mode != "foot" }.joinToString(" › ") { l -> l.line ?: l.mode }
            pane.addRow(row("${hhmm(o.dep) ?: "–"} → ${hhmm(o.arr) ?: "–"}" + (o.minutes?.let { " ($it min)" } ?: ""), legs.ifBlank { "Gå" }).build())
        }
        pane.addAction(Action.Builder().setTitle(if (sent) "Sendt ✓" else "Si fra til familien").setOnClickListener { if (!sent) sendHome() }.build())
        return PaneTemplate.Builder(pane.build()).setTitle("På vei hjem").setHeaderAction(Action.BACK).build()
    }
}

/* ---------------- Media ---------------- */

class Car51Media(ctx: CarContext) : Car51Base(ctx) {
    private var playing: List<Pair<String, String>> = emptyList()
    private var resume: List<Pair<String, String>> = emptyList()
    init { reload() }

    override fun reload() = load { api ->
        playing = runCatching {
            val a = JSONObject(api.hlGet("/playback/sessions?server=all", timeout = 10_000)).optJSONArray("items") ?: JSONArray()
            (0 until a.length()).mapNotNull { a.optJSONObject(it) }.map { s ->
                val st = when (s.optString("state")) { "paused" -> "pause"; "buffering" -> "laster"; else -> "spiller" }
                s.optString("title").ifBlank { "Ukjent" } to listOf(s.optString("user"), s.optString("device"), st, s.optString("remainingText")).filter { it.isNotBlank() }.joinToString(" · ")
            }
        }.getOrDefault(emptyList())
        resume = runCatching {
            val a = JSONObject(api.hlGet("/media51/audio/continue?limit=4", timeout = 10_000)).optJSONArray("items") ?: JSONArray()
            (0 until a.length()).mapNotNull { a.optJSONObject(it) }.map { i ->
                val title = i.optString("episodeTitle").ifBlank { i.optString("title") }
                title.ifBlank { "Lydbok" } to listOf(i.optString("author").ifBlank { i.optString("title").takeIf { _ -> i.optString("episodeTitle").isNotBlank() }.orEmpty() },
                    i.optString("progressText"), i.optString("remainingText")).filter { it.isNotBlank() }.joinToString(" · ")
            }
        }.getOrDefault(emptyList())
    }

    override fun onGetTemplate(): Template {
        error?.let { return message("Media", it) }
        val b = ListTemplate.Builder().setTitle("Media").setHeaderAction(Action.BACK)
        if (loading) return b.setLoading(true).build()
        if (playing.isEmpty() && resume.isEmpty()) return message("Media", "Ingenting spilles nå, og ingen lydbøker eller podkaster å fortsette.")
        val list = ItemList.Builder()
        playing.take(3).forEach { (t, s) -> list.addItem(row("▶ $t", s).build()) }
        resume.take(6 - minOf(3, playing.size)).forEach { (t, s) -> list.addItem(row("Fortsett: $t", s).build()) }
        return b.setSingleList(list.build())
            .setActionStrip(androidx.car.app.model.ActionStrip.Builder().addAction(Action.Builder().setTitle("Oppdater").setOnClickListener { reload(); invalidate() }.build()).build())
            .build()
    }
}

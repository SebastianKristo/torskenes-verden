package no.kristo.finanshub

import android.content.ComponentName
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Binder
import android.os.Build
import android.os.Bundle
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/*
 * Prompt 33 (KAL-ANDROID): Homelab-appen og den nye Kalender-appen (no.kristo.kalender).
 *  - Alt som har med kalender å gjøre åpner Kalender-appen på riktig sted (kalender://…, ?src=homelab gir «◀ Homelab» der).
 *    Er Kalender ikke installert, brukes Homelabs egen kalenderside som før.
 *  - «Logg inn med Homelab-appen»: KalenderLoginProvider33 (signature-tillatelse no.kristo.finanshub.permission.KALENDER_LOGIN)
 *    gir Kalender server-adresse og et eget token: POST /api/tokens/companion {app:'kalender', device} (SERVER33), eldre server:
 *    POST /finans/api/tokens {name:'Kalender (Android · …)'}. Tokenet vises i Innstillinger → Enheter / API-tokens og kan trekkes tilbake.
 *  - Widgets33.fix: Samsung-variantene av prøveperiode-widgetene er på fra installasjonen og slås av på andre telefoner
 *    (før var de av til appen hadde kjørt én gang på en Samsung, og One UI Home oppdaterer ikke galleriet før den startes på nytt).
 */

object KalenderApp33 {
    const val PKG = "no.kristo.kalender"

    fun installed(ctx: Context): Boolean = runCatching { ctx.packageManager.getPackageInfo(PKG, 0); true }.getOrDefault(false)

    /** Åpner kalender://<path>. false = ikke installert (kalleren viser Homelabs egen kalender). */
    fun open(ctx: Context, path: String = ""): Boolean {
        if (!installed(ctx)) return false
        val sep = if (path.contains('?')) "&" else "?"
        val i = Intent(Intent.ACTION_VIEW, Uri.parse("kalender://$path${sep}src=homelab")).setPackage(PKG).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching { ctx.startActivity(i); true }.getOrDefault(false)
    }

    /** Intent for widgetene (Glance actionStartActivity), eller null når Kalender ikke er installert. */
    fun intent(ctx: Context, path: String): Intent? {
        if (!installed(ctx)) return null
        val sep = if (path.contains('?')) "&" else "?"
        return Intent(Intent.ACTION_VIEW, Uri.parse("kalender://$path${sep}src=homelab")).setPackage(PKG)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }

    /** kalender://hendelse?id=…&date=…&t=…&s=…&e=… for en hendelse fra Homelabs kalender. */
    fun eventPath(e: Kal26Ev?, id: String): String {
        if (e == null) return "hendelse?id=" + Uri.encode(id)
        return "hendelse?id=" + Uri.encode(e.id) + "&date=" + e.date + "&t=" + Uri.encode(e.title) +
            (e.start?.let { "&s=" + kalHm(it) } ?: "") + (e.end?.let { "&e=" + kalHm(it) } ?: "")
    }

    fun dayPath(d: LocalDate): String = "dag/$d"
}

/** Åpner Kalender-appen for en hendelse (id), en dag eller i dag. true = åpnet der. */
fun AppViewModel.openKalApp33(selId: String? = null, date: LocalDate? = null, list: Boolean = false): Boolean {
    val ctx = getApplication<android.app.Application>()
    val path = when {
        selId != null -> KalenderApp33.eventPath(kal26.events?.firstOrNull { it.id == selId }, selId)
        date != null -> KalenderApp33.dayPath(date)
        list -> "liste"
        else -> ""
    }
    return KalenderApp33.open(ctx, path)
}

object Widgets33 {
    // Prompt 34: også Glimt-brief · Samsung.
    private val SAMSUNG_TRIALS = listOf("no.kristo.finanshub.widget.S32bTrialsSmallReceiver", "no.kristo.finanshub.widget.S32bTrialsWideReceiver", "no.kristo.finanshub.widget.S34BriefReceiver",
        // Prompt 35: Glimt-brief · Samsung 2×2, 4×1 og 4×4.
        "no.kristo.finanshub.widget.S35Brief22Receiver", "no.kristo.finanshub.widget.S35Brief41Receiver", "no.kristo.finanshub.widget.S35Brief44Receiver")

    /** Samsung-variantene av prøveperiode-widgetene: av på telefoner som ikke er Samsung (på i manifestet). */
    fun fix(ctx: Context) {
        if (Build.MANUFACTURER.equals("samsung", ignoreCase = true)) return
        val pm = ctx.packageManager
        SAMSUNG_TRIALS.forEach { c ->
            runCatching {
                val cn = ComponentName(ctx.packageName, c)
                if (pm.getComponentEnabledSetting(cn) != PackageManager.COMPONENT_ENABLED_STATE_DISABLED)
                    pm.setComponentEnabledSetting(cn, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
            }
        }
    }
}

/**
 * «Logg inn med Homelab-appen» for Kalender-appen. Bare apper signert med samme nøkkel (signature-tillatelsen) kan kalle den,
 * og vi sjekker i tillegg at kalleren er no.kristo.kalender. call("companion", device) → {server, token, username, name} eller {error}.
 */
class KalenderLoginProvider33 : ContentProvider() {
    companion object { const val PERM = "no.kristo.finanshub.permission.KALENDER_LOGIN" }

    override fun onCreate(): Boolean = true

    override fun call(method: String, arg: String?, extras: Bundle?): Bundle? {
        if (method != "companion" && method != "continue41" && method != "exchange41") return null
        val ctx = context ?: return null
        // call() har ingen automatisk tillatelsessjekk (bare query/insert/…): sjekk signature-tillatelsen selv.
        if (ctx.checkCallingPermission(PERM) != PackageManager.PERMISSION_GRANTED) throw SecurityException("Mangler $PERM")
        val caller =runCatching { ctx.packageManager.getPackagesForUid(Binder.getCallingUid())?.toList() }.getOrNull().orEmpty()
        if (KalenderApp33.PKG !in caller) return Bundle().apply { putString("error", "Bare Kalender-appen kan logge inn her.") }
        val store = runCatching { AccountStore(ctx) }.getOrNull() ?: return Bundle().apply { putString("error", "Fikk ikke lest kontoen i Homelab-appen.") }
        val list = runCatching { store.load() }.getOrDefault(emptyList())
        val acc = list.firstOrNull { it.id == store.active() } ?: list.firstOrNull()
            ?: return Bundle().apply { putString("error", if (method == "continue41") "not_logged_in" else "Logg inn i Homelab-appen først.") }
        // Prompt 41 («Fortsett som …» uten app-bytte):
        //  continue41 → {name, username, server, local, external, device_token?} – hvem som er innlogget og adressene (Kalender spør aldri om adresse).
        //    device_token er kortlivet og engangs (POST /api/auth/device-token, 15 min); Kalender bytter det selv på
        //    POST /api/auth/device-exchange {device_token, app:"kalender"} og får egen token. Homelab-økta forlater aldri appen.
        //  exchange41 → {server, token, refresh?, username, name} – Homelab gjør hele byttet selv.
        if (method == "continue41") {
            val dt = runBlocking { withTimeoutOrNull(10_000) { deviceToken41(acc) } }
            return Bundle().apply {
                putString("name", acc.name); putString("username", acc.username)
                putString("server", acc.external.ifBlank { acc.server }); putString("local", acc.local); putString("external", acc.external.ifBlank { acc.server })
                dt?.let { putString("device_token", it) }
            }
        }
        if (method == "exchange41") {
            val r = runBlocking { withTimeoutOrNull(15_000) { deviceExchange41(acc) } }
            return Bundle().apply {
                if (r == null) putString("error", "Homelab-serveren svarte ikke. Prøv igjen, eller logg inn med brukernavn og passord.")
                else { putString("server", acc.external.ifBlank { acc.server }); putString("local", acc.local); putString("token", r.first); r.second?.let { putString("refresh", it) }
                    putString("username", acc.username); putString("name", acc.name) }
            }
        }
        val device = (arg ?: "Kalender (Android · ${Build.MANUFACTURER} ${Build.MODEL})").take(60)
        val token = runBlocking { withTimeoutOrNull(15_000) { companionToken(acc, device) } }
        return Bundle().apply {
            if (token == null) putString("error", "Homelab-serveren svarte ikke. Prøv igjen, eller logg inn med brukernavn og passord.")
            else {
                putString("server", acc.server)
                putString("token", token)
                putString("username", acc.username)
                putString("name", acc.name)
            }
        }
    }

    /** Prompt 41: POST /api/auth/device-token {app:"kalender"} → {device_token} (engangs, 15 min). null = eldre server / ingen kontakt. */
    private suspend fun deviceToken41(acc: UserAccount): String? {
        for (base in listOf(acc.server, acc.local, acc.external).filter { it.isNotBlank() }.distinct()) {
            try {
                val o = JSONObject(Api(base, acc.token).request("POST", "/auth/device-token", JSONObject().put("app", "kalender"), prefix = Api.HOMELAB, timeout = 4_000))
                return o.optString("device_token").takeIf { it.isNotBlank() }
            } catch (e: ApiException) { if (e.status in 400..499) return null } catch (_: Exception) { }
        }
        return null
    }

    /** Prompt 41: device-token → POST /api/auth/device-exchange {device_token, app:"kalender", device} → {token, refresh?}. Eldre server: companion-tokenet. */
    private suspend fun deviceExchange41(acc: UserAccount): Pair<String, String?>? {
        val device = "Kalender (Android · ${Build.MANUFACTURER} ${Build.MODEL})".take(60)
        for (base in listOf(acc.server, acc.local, acc.external).filter { it.isNotBlank() }.distinct()) {
            try {
                val dt = JSONObject(Api(base, acc.token).request("POST", "/auth/device-token", JSONObject().put("app", "kalender"), prefix = Api.HOMELAB)).optString("device_token")
                if (dt.isBlank()) continue
                val o = JSONObject(Api(base, null).request("POST", "/auth/device-exchange", JSONObject().put("device_token", dt).put("app", "kalender").put("device", device), prefix = Api.HOMELAB))
                o.optString("token").takeIf { it.isNotBlank() }?.let { return it to o.optString("refresh").takeIf { r -> r.isNotBlank() } }
            } catch (e: ApiException) {
                if (e.status == 404 || e.status == 405) return companionToken(acc, device)?.let { it to null }
            } catch (_: Exception) { }
        }
        return null
    }

    /** Eget token for Kalender (samme bruker). Prøver de andre adressene til kontoen hvis den første ikke svarer. */
    private suspend fun companionToken(acc: UserAccount, device: String): String? {
        for (base in listOf(acc.server, acc.local, acc.external).filter { it.isNotBlank() }.distinct()) {
            val api = Api(base, acc.token)
            try {
                val o = JSONObject(api.request("POST", "/tokens/companion", JSONObject().put("app", "kalender").put("device", device), prefix = Api.HOMELAB))
                o.optString("token").takeIf { it.isNotBlank() }?.let { return it }
            } catch (e: ApiException) {
                // Eldre server uten /api/tokens/companion: et vanlig app-token med samme tilganger som Homelab-appen har.
                if (e.status == 404 || e.status == 405 || e.status == 403) {
                    runCatching {
                        val scopes = JSONArray(listOf("finance:read", "finance:write", "receipts:write", "read:transactions", "read:summary", "read:budget", "write:transactions"))
                        val o = JSONObject(api.post("/tokens", JSONObject().put("name", device).put("scopes", scopes).put("expiresDays", JSONObject.NULL)))
                        o.optString("token").takeIf { it.isNotBlank() }
                    }.getOrNull()?.let { return it }
                    if (e.status != 403) return null
                }
            } catch (_: Exception) { }
        }
        return null
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}

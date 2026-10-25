package no.kristo.finanshub

import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

/*
 * Prompt 51 (ANDPLAT51): App Actions og app-snarveier for de samme handlingene som Siri-snarveiene på iOS:
 *   «sjekk inn» · «legg til melk» (i handlelisten) · «hva er saldoen» · «når går bussen».
 *
 *  - Statiske snarveier + App Actions-kapabiliteter i res/xml/shortcuts51.xml (meta-data android.app.shortcuts på startikon-aliasene):
 *    actions.intent.OPEN_APP_FEATURE (feature = «sjekk inn», «saldo», «buss», «handleliste») og actions.intent.GET_THING
 *    (thing.name – «legg til melk» / «kjøp melk» legger varen i handlelisten, ellers åpnes Søk).
 *  - Dynamisk snarvei «Legg til <siste vare>» (Shortcuts51.publish) så den vanligste varen er ett trykk unna.
 *  - Alt går som dyplenker finanshub://act51/<handling>[?item=…|?q=…|?feature=…] til MainActivity → AppViewModel.deepLink → [act51Link].
 *    Ingen tokens i lenkene; ukjent/uinnlogget → ingenting skjer (deepLink sjekker loggedIn).
 *  - Uten nett legges varen i offline-køen (Offline51Plat.kt) og sendes senere.
 */

object Shortcuts51 {
    private const val SP = "shortcuts51"
    const val DEFAULT_ITEM = "melk"

    private fun link(ctx: Context, path: String) = Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://act51/$path"), ctx, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)

    fun lastItem(ctx: Context): String = ctx.getSharedPreferences(SP, Context.MODE_PRIVATE).getString("last", null)?.takeIf { it.isNotBlank() } ?: DEFAULT_ITEM

    fun rememberItem(ctx: Context, item: String) {
        ctx.getSharedPreferences(SP, Context.MODE_PRIVATE).edit().putString("last", item.trim().lowercase().take(30)).apply()
        publish(ctx)
    }

    /** Dynamisk snarvei for siste vare (statisk «Legg til melk» finnes alltid). Kalles ved oppstart og når en vare legges til. */
    fun publish(ctx: Context) {
        runCatching {
            val sm = ctx.getSystemService(ShortcutManager::class.java) ?: return
            val item = lastItem(ctx)
            if (item == DEFAULT_ITEM) { sm.removeDynamicShortcuts(listOf("add51_last")); return }
            val label = "Legg til $item".take(25)
            val info = ShortcutInfo.Builder(ctx, "add51_last")
                .setShortLabel(label).setLongLabel("Legg til $item i handlelisten".take(40))
                .setIcon(Icon.createWithResource(ctx, R.drawable.sc51_add))
                .setIntent(link(ctx, "add?item=" + URLEncoder.encode(item, "UTF-8")))
                .setRank(0)
                .build()
            sm.addDynamicShortcuts(listOf(info))
        }
    }

    /** «Hva er saldoen?» og liknende: brukes til statistikk for launcheren (forslag). */
    fun reportUsed(ctx: Context, id: String) { runCatching { ctx.getSystemService(ShortcutManager::class.java)?.reportShortcutUsed(id) } }

    /** «legg til melk», «kjøp melk og egg», «legg melk på handlelisten» → [melk] eller [melk, egg]. Ellers tom liste. */
    fun itemsOf(q: String): List<String> {
        val t = q.trim().lowercase().removeSuffix(".").removeSuffix("!")
        val m = Regex("""^(legg til|legg|kjøp|handle|husk)\s+(.+?)(\s+(i|på|til)\s+(handlelisten|handlelista|handel|lista|listen))?$""").find(t) ?: return emptyList()
        return m.groupValues[2].split(Regex("""\s*(,|\bog\b)\s*""")).map { it.trim() }.filter { it.isNotBlank() && it.length <= 40 }.take(8)
    }
}

/** Handlelisten i Gjøremål: listen som heter «Handel» (eller «Handleliste»/«Handle…»); null = brukerens standardliste. */
internal suspend fun shoppingListId51(api: Api): String? {
    val raw = runCatching { api.hlGet("/tasks/lists", timeout = 8_000) }.getOrNull() ?: return null
    val a = runCatching { JSONObject(raw).optJSONArray("lists") }.getOrNull() ?: runCatching { JSONArray(raw) }.getOrNull() ?: return null
    val lists = (0 until a.length()).mapNotNull { a.optJSONObject(it) }
    val hit = lists.firstOrNull { it.optString("name").equals("Handel", true) }
        ?: lists.firstOrNull { it.optString("name").lowercase().startsWith("handle") }
    return hit?.optString("id")?.takeIf { it.isNotBlank() }
}

/** Legger varene i handlelisten (offline-kø uten nett). Returnerer teksten som vises. */
internal suspend fun addShopping51(ctx: Context, api: Api, items: List<String>): String {
    if (items.isEmpty()) return "Ingen vare å legge til"
    val list = shoppingListId51(api)
    var queued = false
    for (i in items) {
        val title = i.replaceFirstChar { it.uppercase() }
        val b = JSONObject().put("title", title).put("n", title)
        if (list != null) b.put("list", list).put("l", list)
        if (!sendOrQueue51(ctx, api, "POST", "/tasks", b, "Handleliste: $title")) queued = true
    }
    Shortcuts51.rememberItem(ctx, items.last())
    val what = items.joinToString(", ")
    return if (queued) "La $what i køen – sendes når du er på nett igjen" else "La til $what i handlelisten"
}

/** finanshub://act51/<handling> fra snarveiene, App Actions og Wear/Auto-lenker. */
fun AppViewModel.act51Link(uri: Uri) {
    val path = uri.path?.trim('/').orEmpty()
    val ctx = appCtx35
    when (path) {
        "checkin", "sjekk" -> { Shortcuts51.reportUsed(ctx, "checkin51"); familyLink50(Uri.parse("finanshub://familie/sjekk")) }
        "saldo", "balance" -> { Shortcuts51.reportUsed(ctx, "saldo51"); go(Screen.Home) }
        "buss", "avganger" -> { Shortcuts51.reportUsed(ctx, "buss51"); go(Screen.Homelab); openRuter() }
        "handleliste", "tasks" -> openTasks()
        "add" -> addFromLink51(listOfNotNull(uri.getQueryParameter("item")?.takeIf { it.isNotBlank() } ?: Shortcuts51.DEFAULT_ITEM))
        "feature" -> {
            val f = uri.getQueryParameter("feature").orEmpty().lowercase()
            when {
                "sjekk" in f || "check" in f -> act51Link(Uri.parse("finanshub://act51/checkin"))
                "saldo" in f || "konto" in f || "penger" in f -> act51Link(Uri.parse("finanshub://act51/saldo"))
                "buss" in f || "avgang" in f || "trikk" in f || "t-bane" in f || "ruter" in f -> act51Link(Uri.parse("finanshub://act51/buss"))
                "handle" in f || "liste" in f -> openTasks()
                else -> go(Screen.Homelab)
            }
        }
        "q" -> {
            val q = uri.getQueryParameter("q").orEmpty()
            val items = Shortcuts51.itemsOf(q)
            if (items.isNotEmpty()) addFromLink51(items) else go(Screen.Search)
        }
    }
}

private fun AppViewModel.addFromLink51(items: List<String>) {
    val ctx = appCtx35
    Shortcuts51.reportUsed(ctx, "add51")
    openTasks()
    launch37 {
        val api = api37 { this }
        val text = try { addShopping51(ctx, api, items) } catch (e: ApiException) { "Fikk ikke lagt til: ${e.message ?: "feil"}" }
        flash(text)
        refreshTasks37()
    }
}

package no.kristo.finanshub

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * En innlogget konto: server + bruker + token. Flere kontoer kan være logget inn samtidig,
 * og hver har egne data, tokens og varsler på serveren.
 * local/external: valgfrie adresser for «Bruk lokal adresse hjemme».
 */
data class UserAccount(
    val id: String, val server: String, val username: String, val name: String, val role: String, val token: String,
    val local: String = "", val external: String = "",
) {
    fun toJson(): JSONObject = JSONObject().put("id", id).put("server", server).put("username", username).put("name", name)
        .put("role", role).put("token", token).put("local", local).put("external", external)

    companion object {
        fun from(o: JSONObject) = UserAccount(
            o.optString("id").ifBlank { UUID.randomUUID().toString() }, o.optString("server"), o.optString("username"), o.optString("name"),
            o.optString("role", "admin"), o.optString("token"), o.optString("local"), o.optString("external"),
        )
    }
}

/** Kontoene og tokenene lagres kryptert (Android Keystore). */
class AccountStore(ctx: Context) {
    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        "finanshub", MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC), ctx,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    fun load(): List<UserAccount> {
        val raw = prefs.getString("accounts", null)
        if (raw != null) return runCatching { JSONArray(raw).let { a -> (0 until a.length()).map { UserAccount.from(a.getJSONObject(it)) } } }.getOrDefault(emptyList())
        // Eldre versjon: én server og ett token.
        val server = prefs.getString("server", null)
        val token = prefs.getString("token", null)
        if (server.isNullOrBlank() || token.isNullOrBlank()) return emptyList()
        val a = UserAccount(UUID.randomUUID().toString(), server, "", "", "admin", token)
        save(listOf(a), a.id)
        prefs.edit().remove("token").apply()
        return listOf(a)
    }

    fun save(list: List<UserAccount>, active: String?) {
        prefs.edit().putString("accounts", JSONArray().apply { list.forEach { put(it.toJson()) } }.toString()).putString("active", active).apply()
    }

    fun active(): String? = prefs.getString("active", null)
    fun lastServer(): String = prefs.getString("server", null) ?: ""
    fun rememberServer(s: String) { prefs.edit().putString("server", s).apply() }
}

/** Valg som ikke er hemmelige (lås, utseende, skanning, varsler). */
class AppPrefs(ctx: Context) {
    private val p: SharedPreferences = ctx.getSharedPreferences("finanshub_prefs", Context.MODE_PRIVATE)

    fun bool(k: String, def: Boolean = false) = p.getBoolean(k, def)
    fun str(k: String, def: String) = p.getString(k, def) ?: def
    fun int(k: String, def: Int) = p.getInt(k, def)
    fun set(k: String, v: Any) {
        p.edit().apply {
            when (v) {
                is Boolean -> putBoolean(k, v)
                is Int -> putInt(k, v)
                else -> putString(k, v.toString())
            }
        }.apply()
    }

    companion object {
        const val LOCK = "lock"                 // lås med fingeravtrykk / ansikt
        const val LOCK_AFTER = "lock_after"     // minutter: 0, 1, 5, 15
        const val HIDE_SWITCHER = "hide_switcher"
        const val HIDE_AMOUNTS = "hide_amounts"
        const val START = "start"               // homelab | home | list | budget
        const val COLOR = "m3_seed"             // system | orange | blue | green | purple | pink | yellow
        const val MODE = "m3_mode"              // system | light | dark
        const val PAGES = "m3_pages"            // same | own: samme farger på alle sider, eller egen farge per side
        const val W_ALPHA = "w_alpha"           // Samsung-widgetene: dekkevne på bakgrunnen i prosent (0–100)
        const val W_THEME = "w_theme"           // Samsung-widgetene: system | dark | light
        const val LAYOUT = "layout_"            // + konto-ID: oppsettet av mobilforsiden (per bruker og enhet)
        const val SCAN_TAP = "scan_tap"         // camera | choices
        const val AUTO_CROP = "auto_crop"
        const val KEEP_ORIGINAL = "keep_original"
        const val WIFI_ONLY = "wifi_only"
        const val AI_ENGINE = "ai_engine"       // ollama | gemini | both
        const val N_RECEIPT = "n_receipt"
        const val N_BUDGET = "n_budget"
        const val N_SUB = "n_sub"
        const val N_DOMAIN = "n_domain"
        const val N_WEEKLY = "n_weekly"
        const val USE_LOCAL = "use_local"
        const val SEARCH_MODE = "search_mode"   // ai | plain
        const val MOBILE_DESIGN = "mobile_design" // klassisk | papir
        const val PAPER_MODE = "paper_mode"     // auto | lys | mork
        const val PHOTO = "photo_window"        // cur | oslo | weather | planets | custom
        const val BG_PLANET = "bg_planet"       // auto | earth | moon | jupiter | mars | saturn (prompt 19 og 21)
        const val BG_ROTATE = "bg_rotate"       // daily | hourly
        const val BG_BLUR = "bg_blur"           // 0–20 px
        const val BG_DIM = "bg_dim"             // 0–60 %
        const val BG_WIFI = "bg_wifi_only"      // nye bakgrunnsbilder bare på Wi-Fi
        const val BG_ANIMATE = "bg_animate"     // regn/snø over bakgrunnen
        const val DESIGN_SYNCED = "design_synced" // valgene over er hentet fra serveren én gang
        const val FRESH_PAPIR = "fresh_papir"   // appen ble installert med Papir som standard
        const val PAGES_LAYOUT = "pages_layout_" // + konto-ID: rekkefølge og skjulte kort per side i Papir (layout.pages)
        const val FIN_TABS = "fin_tabs_"        // + konto-ID: fanene i Finans-linja (opptil 4)
        const val FOURTH_TAB = "fourth_tab"     // auto | domener | sporing
        const val FAB_STYLE = "fab_style"       // float | inline
        const val TAB_BAR = "tab_bar_"          // + konto-ID: Papir-hovedlinja (layout.tabBar.items)
        const val ICON_THEME = "icon_theme"     // standard | varm | kjolig | mono | fargerik
        const val ONBOARDED = "onboarded_"      // + konto-ID: onboardingen i Papir er fullført på denne enheten
    }
}

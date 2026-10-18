package no.kristo.finanshub

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon

/*
 * Prompt 24 (A): app-ikon og navn under ikonet via activity-alias (AndroidManifest.xml).
 * Hvert ikon finnes som «IconHus» (standardnavnet) og som «IconHus_<Navn>» for hvert ferdige navn.
 * Bare ett alias er på om gangen. Det nye slås på FØR de andre slås av, ellers kan appen forsvinne fra appskuffen.
 */

/** Ferdige navn under ikonet på Android (et fritt navn vises bare inne i appen). */
val APP_LABELS = listOf("Homelab", "Hjem", "Familie", "Finans", "Papir")

private const val ALIAS_PKG = "no.kristo.finanshub"

/** Aliaset for ikon + navn. Ukjent ikon gir standardikonet, og et fritt navn gir standardnavnet. */
fun launcherAlias24(icon: String, label: String?): String {
    val base = APP_ICONS.firstOrNull { it.first == icon }?.third ?: "IconHus"
    return if (label != null && label in APP_LABELS) "${base}_$label" else base
}

/** Alle aliasene i manifestet som har LAUNCHER. */
fun allAliases24(): List<String> = APP_ICONS.flatMap { (_, _, a) -> listOf(a) + APP_LABELS.map { "${a}_$it" } }

/**
 * Slår på aliaset og deretter av alle de andre. Gir false (og endrer ingenting) hvis aliaset ikke kunne slås på.
 * Komponentnavnet bruker kodens pakke (namespace), pakken er applicationId.
 */
fun applyLauncher24(ctx: Context, alias: String): Boolean {
    val pm = ctx.packageManager
    val target = ComponentName(ctx.packageName, "$ALIAS_PKG.$alias")
    try {
        pm.setComponentEnabledSetting(target, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
    } catch (e: Exception) {
        return false
    }
    allAliases24().filter { it != alias }.forEach { a ->
        val cn = ComponentName(ctx.packageName, "$ALIAS_PKG.$a")
        runCatching {
            val st = pm.getComponentEnabledSetting(cn)
            // Bare «IconHus» er på fra manifestet; de andre er av med mindre appen har slått dem på.
            val on = st == PackageManager.COMPONENT_ENABLED_STATE_ENABLED || (st == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && a == "IconHus")
            if (on) pm.setComponentEnabledSetting(cn, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
        }
    }
    return true
}

/** «Legg til snarvei med eget navn»: festet snarvei med fritt navn og valgt ikon (launcheren spør brukeren). */
fun pinNamedShortcut24(ctx: Context, name: String, icon: String): Boolean {
    val sm = ctx.getSystemService(ShortcutManager::class.java) ?: return false
    if (!sm.isRequestPinShortcutSupported) return false
    val res = when (icon) { "monogram" -> no.kristo.finanshub.R.mipmap.ic_launcher_mono; "rom" -> no.kristo.finanshub.R.mipmap.ic_launcher_rom; else -> no.kristo.finanshub.R.mipmap.ic_launcher_hus }
    val intent = Intent(ctx, MainActivity::class.java).setAction(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val info = ShortcutInfo.Builder(ctx, "named_" + name.lowercase().filter { it.isLetterOrDigit() }.ifBlank { "app" })
        .setShortLabel(name.take(20)).setLongLabel(name.take(20)).setIcon(Icon.createWithResource(ctx, res)).setIntent(intent).build()
    return runCatching { sm.requestPinShortcut(info, null) }.getOrDefault(false)
}

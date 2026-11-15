package no.kristo.felles.android

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import java.security.KeyStore

/**
 * Kryptert lagring av tokens og kontoer (Android Keystore, AES-256), felles for :app, :kalender og :wear.
 *
 * B4 (D-android §8): `EncryptedSharedPreferences.create` kan kaste ved oppstart når nøkkelen eller fila er ødelagt (kjent etter
 * gjenoppretting av sikkerhetskopi, bytte av skjermlås eller OEM-feil: AEADBadTagException, KeyStoreException …). Før krasjet
 * appen da ved hver oppstart. Nå gjenopprettes lagringen trinnvis, og det verste som kan skje er at brukeren må logge inn igjen:
 *  1. Åpne som før.
 *  2. Feiler det: slett fila (keysettet ligger i den) og lag en ny.
 *  3. Feiler det igjen: nøkkelen i Keystore er ødelagt. Slett den og fila, og lag begge på nytt.
 *  4. Feiler også det: en lagring i minnet for denne økten. Tokens skrives **aldri** ukryptert til disk.
 *
 * Kalender og Wear falt tidligere tilbake til vanlige SharedPreferences (`…_plain`), så tokenet kunne ligge ukryptert.
 * [prefs] med `gammelKlartekst` flytter det som ligger der inn i den krypterte fila og sletter den gamle.
 */
object SikkerLagring {
    private const val TAG = "SikkerLagring"
    private val cache = HashMap<String, SharedPreferences>()

    /** true når lagringen måtte nullstilles siden appen startet (innloggingen er borte, brukeren må logge inn igjen). */
    @Volatile
    var nullstilt: Boolean = false
        private set

    /** true når lagringen bare finnes i minnet (Keystore virker ikke på enheten); ingenting huskes etter omstart. */
    @Volatile
    var barIMinnet: Boolean = false
        private set

    /** Den krypterte fila [navn]. Samme objekt for samme navn så lenge prosessen lever. */
    @JvmStatic
    @Synchronized
    fun prefs(ctx: Context, navn: String, gammelKlartekst: String? = null): SharedPreferences {
        cache[navn]?.let { return it }
        val app = ctx.applicationContext
        val p = apne(app, navn)
        if (gammelKlartekst != null) flyttKlartekst(app, gammelKlartekst, p)
        cache[navn] = p
        return p
    }

    private fun lag(app: Context, navn: String): SharedPreferences = EncryptedSharedPreferences.create(
        navn, MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC), app,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    private fun apne(app: Context, navn: String): SharedPreferences {
        try { return lag(app, navn) } catch (e: Exception) { Log.w(TAG, "Kryptert lagring kunne ikke åpnes, lager ny fil", e) }
        nullstilt = true
        runCatching { app.deleteSharedPreferences(navn) }
        try { return lag(app, navn) } catch (e: Exception) { Log.w(TAG, "Ny fil feilet, lager ny nøkkel", e) }
        // Nøkkelen er ødelagt. Alle krypterte filer i appen er da uleselige og nullstilles når de åpnes.
        runCatching { KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(MasterKeys.AES256_GCM_SPEC.keystoreAlias) }
        runCatching { app.deleteSharedPreferences(navn) }
        try { return lag(app, navn) } catch (e: Exception) { Log.w(TAG, "Keystore virker ikke, lagrer bare i minnet", e) }
        barIMinnet = true
        return MinneLagring()
    }

    /** Flytter innholdet i en gammel ukryptert fil inn i [til] og sletter fila. */
    private fun flyttKlartekst(app: Context, gammel: String, til: SharedPreferences) {
        runCatching {
            val g = app.getSharedPreferences(gammel, Context.MODE_PRIVATE)
            val alt = g.all
            if (alt.isNotEmpty()) {
                val e = til.edit()
                for ((k, v) in alt) {
                    if (til.contains(k)) continue
                    when (v) {
                        is String -> e.putString(k, v)
                        is Boolean -> e.putBoolean(k, v)
                        is Int -> e.putInt(k, v)
                        is Long -> e.putLong(k, v)
                        is Float -> e.putFloat(k, v)
                        is Set<*> -> e.putStringSet(k, v.filterIsInstance<String>().toSet())
                    }
                }
                e.commit()
            }
            g.edit().clear().commit()
            app.deleteSharedPreferences(gammel)
        }.onFailure { Log.w(TAG, "Kunne ikke flytte gammel fil", it) }
    }
}

/** SharedPreferences i minnet: siste reserve når Keystore ikke virker. Ingenting skrives til disk. */
internal class MinneLagring : SharedPreferences {
    private val data = HashMap<String, Any?>()
    private val lyttere = LinkedHashSet<SharedPreferences.OnSharedPreferenceChangeListener>()

    @Synchronized override fun getAll(): MutableMap<String, *> = HashMap(data)
    @Synchronized override fun getString(key: String?, defValue: String?): String? = data[key] as? String ?: defValue
    @Suppress("UNCHECKED_CAST")
    @Synchronized override fun getStringSet(key: String?, defValues: MutableSet<String>?): MutableSet<String>? = (data[key] as? Set<String>)?.toMutableSet() ?: defValues
    @Synchronized override fun getInt(key: String?, defValue: Int): Int = data[key] as? Int ?: defValue
    @Synchronized override fun getLong(key: String?, defValue: Long): Long = data[key] as? Long ?: defValue
    @Synchronized override fun getFloat(key: String?, defValue: Float): Float = data[key] as? Float ?: defValue
    @Synchronized override fun getBoolean(key: String?, defValue: Boolean): Boolean = data[key] as? Boolean ?: defValue
    @Synchronized override fun contains(key: String?): Boolean = data.containsKey(key)
    override fun edit(): SharedPreferences.Editor = Redigering()
    @Synchronized override fun registerOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) { listener?.let { lyttere.add(it) } }
    @Synchronized override fun unregisterOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) { lyttere.remove(listener) }

    private inner class Redigering : SharedPreferences.Editor {
        private val endringer = HashMap<String, Any?>()
        private val fjern = HashSet<String>()
        private var tom = false

        override fun putString(key: String, value: String?): SharedPreferences.Editor = apply { endringer[key] = value }
        override fun putStringSet(key: String, values: MutableSet<String>?): SharedPreferences.Editor = apply { endringer[key] = values?.toSet() }
        override fun putInt(key: String, value: Int): SharedPreferences.Editor = apply { endringer[key] = value }
        override fun putLong(key: String, value: Long): SharedPreferences.Editor = apply { endringer[key] = value }
        override fun putFloat(key: String, value: Float): SharedPreferences.Editor = apply { endringer[key] = value }
        override fun putBoolean(key: String, value: Boolean): SharedPreferences.Editor = apply { endringer[key] = value }
        override fun remove(key: String): SharedPreferences.Editor = apply { fjern.add(key) }
        override fun clear(): SharedPreferences.Editor = apply { tom = true }
        override fun commit(): Boolean { skriv(); return true }
        override fun apply() { skriv() }

        private fun skriv() {
            val endret = ArrayList<String>()
            val varsle: List<SharedPreferences.OnSharedPreferenceChangeListener>
            synchronized(this@MinneLagring) {
                if (tom) { endret.addAll(data.keys); data.clear() }
                for (k in fjern) { data.remove(k); endret.add(k) }
                for ((k, v) in endringer) { if (v == null) data.remove(k) else data[k] = v; endret.add(k) }
                varsle = lyttere.toList()
            }
            for (k in endret.distinct()) for (l in varsle) l.onSharedPreferenceChanged(this@MinneLagring, k)
        }
    }
}

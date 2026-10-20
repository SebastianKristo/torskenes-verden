package no.kristo.finanshub

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import android.net.Uri
import android.os.VibrationEffect
import android.os.Vibrator

/*
 * Prompt 39 (ANDROID39) – claude-code-varsellyd-myk-android.md: «varslingslyd er veldig høy og ekkel på android».
 *
 * Årsakene i appen før:
 *  - Glimt-varslene (Notify31, kanal «glimt31») gikk på IMPORTANCE_HIGH uten egen lyd, altså telefonens standard varsellyd
 *    som heads-up – det er den høye, skarpe lyden.
 *  - De innebygde lydene (res/raw/varsel_*.wav) var toner på 1,3–1,6 kHz med topp −1,9 dBFS (ca. −12 LUFS) og 10 ms angrep.
 *  - Forhåndslytting og egen lyd gikk via MediaPlayer med volum 80 % og USAGE_NOTIFICATION, uten demping og uten å se på
 *    lydløs / Ikke forstyrr.
 *  - Kanalens lyd kan ikke endres etter at kanalen er laget, så selv nye filer ville ikke nådd brukere med gamle kanaler.
 *
 * Nå: alle lydene er laget på nytt i 390–880 Hz (fasiten sndList: sinus + svak oktav, 25 ms myk inngang, utklang, lavpass
 * 2,4 kHz, kompressor) og normalisert til −16 LUFS / ≤ −3 dBTP; ny standard «Dråpe (myk)» (res/raw/glimt_draape.ogg).
 * Nye kanal-ID-er (…39) med myk lyd og kort, lav vibrasjon; de gamle kanalene slettes én gang. Lyd i appen går via SoundPool
 * (USAGE_NOTIFICATION_EVENT, følger varselvolumet) × 0,55 og spilles ikke i lydløs modus eller Ikke forstyrr.
 */
object Sound39 {
    /** Innebygde lyder: nøkkel → res/raw-navn. */
    val RAW = mapOf(
        "draape" to "glimt_draape", "klokke" to "varsel_klokke", "pling" to "varsel_pling", "papir" to "varsel_papir",
        "dobbel" to "varsel_dobbel", "dyp" to "varsel_dyp",
    )
    const val DEFAULT = "draape"
    const val DEFAULT_VOLUME = 50
    val VOLUMES = listOf(20, 35, 50, 70, 100)

    /** Glimt-svar (myk dråpe, IMPORTANCE_DEFAULT). */
    const val CH_GLIMT = "glimt_ai"
    /** Prøveperioder, oppdateringer og andre påminnelser fra Notify31. */
    const val CH_REMIND = "paminn39"
    /** Finans: lav, uten lyd. */
    const val CH_FINANS = "finans39"
    /** Stille timer / «Stille»: minst mulig forstyrrelse. */
    const val CH_STILLE = "stille39"
    /** Egen lyd: kanalen er uten lyd, appen spiller fila selv. */
    const val CH_EGEN = "varsel39_egen"

    private val OLD = listOf("glimt31", "varsel_klokke", "varsel_pling", "varsel_papir", "varsel_dobbel", "varsel_dyp", "varsel_stille")

    /** Kort og lav vibrasjon: [0,18,40,14] ms med styrke [0,90,0,60]. */
    val VIBE = longArrayOf(0, 18, 40, 14)
    private val VIBE_AMP = intArrayOf(0, 90, 0, 60)

    fun uri(ctx: Context, sound: String): Uri? = RAW[sound]?.let { Uri.parse("android.resource://${ctx.packageName}/raw/$it") }

    private val attrs: AudioAttributes get() = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()

    /** Sletter de gamle kanalene (høy standardlyd / gamle filer) én gang, så brukerne får de nye, myke. */
    fun migrate(ctx: Context) {
        val sp = ctx.getSharedPreferences("notify_prefs", Context.MODE_PRIVATE)
        if (sp.getBoolean("ch39", false)) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        OLD.forEach { id -> runCatching { nm.deleteNotificationChannel(id) } }
        sp.edit().putBoolean("ch39", true).apply()
    }

    /** Kanal for en lyd (lages første gang). */
    fun soundChannel(ctx: Context, sound: String): String {
        migrate(ctx)
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val id = when {
            sound in RAW -> "varsel39_$sound"
            sound == "egen" -> CH_EGEN
            else -> CH_STILLE
        }
        if (nm.getNotificationChannel(id) != null) return id
        val name = when (sound) {
            "draape" -> "Varsler · Dråpe (myk)"; "klokke" -> "Varsler · Klokke"; "pling" -> "Varsler · Pling"; "papir" -> "Varsler · Papir"
            "dobbel" -> "Varsler · Dobbel"; "dyp" -> "Varsler · Dyp"; "egen" -> "Varsler · egen lyd"; else -> "Varsler · stille"
        }
        val imp = if (id == CH_STILLE) NotificationManager.IMPORTANCE_MIN else NotificationManager.IMPORTANCE_DEFAULT
        val ch = NotificationChannel(id, name, imp).apply {
            description = "Pakker, familie, kalender og vær"
            val u = uri(ctx, sound)
            if (u != null) setSound(u, attrs) else setSound(null, null)
            if (id != CH_STILLE) { enableVibration(true); vibrationPattern = VIBE } else enableVibration(false)
        }
        nm.createNotificationChannel(ch)
        return id
    }

    /** Finans og hjem: IMPORTANCE_LOW, uten lyd. */
    fun finansChannel(ctx: Context): String {
        migrate(ctx)
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CH_FINANS) == null) nm.createNotificationChannel(
            NotificationChannel(CH_FINANS, "Finans og hjem", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Kvitteringer, budsjett og faste trekk (uten lyd)"; setSound(null, null); enableVibration(false)
            },
        )
        return CH_FINANS
    }

    /** Glimt-svar («Glimt-svar») og påminnelser: myk dråpe, IMPORTANCE_DEFAULT (ikke heads-up med systemlyden). */
    fun glimtChannel(ctx: Context, remind: Boolean = false): String {
        migrate(ctx)
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val id = if (remind) CH_REMIND else CH_GLIMT
        if (nm.getNotificationChannel(id) == null) nm.createNotificationChannel(
            NotificationChannel(id, if (remind) "Påminnelser" else "Glimt-svar", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = if (remind) "Prøveperioder og oppdateringer" else "Svar fra Glimt mens du er ute av appen"
                setSound(uri(ctx, DEFAULT), attrs)
                enableVibration(true); vibrationPattern = VIBE
            },
        )
        return id
    }

    /* ---------- Lyd i appen ---------- */

    /** Lydløs, vibrer eller Ikke forstyrr: ingen lyd fra appen. */
    fun muted(ctx: Context): Boolean {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        if (am != null && am.ringerMode != AudioManager.RINGER_MODE_NORMAL) return true
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        val f = nm?.currentInterruptionFilter ?: NotificationManager.INTERRUPTION_FILTER_ALL
        return f != NotificationManager.INTERRUPTION_FILTER_ALL && f != NotificationManager.INTERRUPTION_FILTER_UNKNOWN
    }

    private fun vibrateSoft(ctx: Context) {
        runCatching {
            val v = ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
            if (!v.hasVibrator()) return
            if (v.hasAmplitudeControl()) v.vibrate(VibrationEffect.createWaveform(VIBE, VIBE_AMP, -1))
            else v.vibrate(VibrationEffect.createWaveform(VIBE, -1))
        }
    }

    private var pool: SoundPool? = null
    private val ids = HashMap<String, Int>()
    private val loaded = HashSet<Int>()
    private val waiting = HashMap<Int, Float>()

    private fun pool(): SoundPool = pool ?: SoundPool.Builder().setMaxStreams(2)
        .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
        .build().also { p ->
            p.setOnLoadCompleteListener { sp, id, status ->
                if (status == 0) { loaded.add(id); waiting.remove(id)?.let { v -> sp.play(id, v, v, 1, 0, 1f) } }
            }
            pool = p
        }

    /**
     * Spiller en lyd i appen (forhåndslytting og egen lyd). Volum 0–100 fra innstillingene; Android-demping × 0,55 (egen fil × 0,6).
     * I lydløs / vibrer / Ikke forstyrr: ingen lyd, bare kort vibrasjon hvis telefonen står på vibrer.
     */
    fun play(ctx: Context, sound: String, volume: Int, file: java.io.File? = null, force: Boolean = false) {
        if (sound == "stille") return
        if (!force && muted(ctx)) {
            val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            if (am?.ringerMode == AudioManager.RINGER_MODE_VIBRATE) vibrateSoft(ctx)
            return
        }
        val k = (volume.coerceIn(0, 100) / 100f) * (if (sound == "egen") .6f else .55f)
        if (k <= 0f) return
        runCatching {
            val p = pool()
            val key = if (sound == "egen") "egen:" + (file?.absolutePath ?: return) + ":" + (file.lastModified()) else sound
            val id = ids[key] ?: run {
                val res = RAW[sound]?.let { ctx.resources.getIdentifier(it, "raw", ctx.packageName) } ?: 0
                val nid = when {
                    sound == "egen" && file != null -> p.load(file.absolutePath, 1)
                    res != 0 -> p.load(ctx, res, 1)
                    else -> return
                }
                ids[key] = nid
                nid
            }
            if (id in loaded) p.play(id, k, k, 1, 0, 1f) else waiting[id] = k
        }
    }

    /** Tekst under volumvalget. */
    const val DAMP_NOTE = "Dempet på Android · varslene følger varselvolumet på telefonen"
}

package no.kristo.finanshub

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import no.kristo.finanshub.ui.FinansApp
import no.kristo.finanshub.ui.FinansTheme

/** FragmentActivity fordi BiometricPrompt trenger det; Compose fungerer som før. */
class MainActivity : FragmentActivity() {
    private val vm: AppViewModel by viewModels()
    private lateinit var prompt: BiometricPrompt
    private var prompting = false

    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        runCatching { Crash51.install(this) } // prompt 51: krasj → fil, sendes ved neste oppstart (Qa51.kt)
        runCatching { Theme51.init(this) } // prompt 51 (ANDFEAT51): tema per bruker / automatisk tema
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        preferHighRefresh39() // prompt 39: myke sveip på 90/120 Hz-skjermer
        runCatching { Sound39.migrate(this) } // prompt 39: gamle, høye varselkanaler byttes med de myke
        applySwitcherPrivacy()
        // Prompt 85: delingen/lenken som startet aktiviteten behandles bare én gang. Uten dette ble samme intent kjørt på nytt
        // når aktiviteten ble laget på nytt (lyst/mørkt, skriftstørrelse, prosessdød) eller hentet fra Nylige: kvitteringen
        // ble lastet opp to ganger, og varsel-lenker som «Ja, start» (Hjemlys) og «Hent» (Sjekk inn) ble sendt en gang til.
        val fresh85 = freshLaunch85(savedInstanceState != null, intent?.flags ?: 0)
        if (fresh85) handleShare(intent)
        prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { prompting = false; vm.locked = false }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) { prompting = false }
        })
        setContent {
            // Brettbare: bredde ≥ 600 dp (Medium/Expanded) gir navigasjonsrail og to paneler.
            val size = calculateWindowSizeClass(this)
            // Papir · lys / mørk / følg systemet (Innstillinger → Utseende). Prompt 42: det eneste designet.
            // Prompt 51 (ANDFEAT51): «Automatisk» tema (etter solen / klokkeslett, synket mellom enheter) velger lys/mørk her (Theme51.kt).
            FinansTheme(Theme51.paperMode(vm.paperMode)) {
                FinansApp(vm, size.widthSizeClass, unlock = ::unlock, onPrivacyChanged = ::applySwitcherPrivacy)
            }
        }
        // Haptikk går via vinduets rotvisning (følger «Vibrasjon og haptikk» i systemet).
        Haptics.attach(window.decorView, vm.prefs)
        // Widgetene: henting hvert 15. minutt, og ferske data når appen åpnes.
        no.kristo.finanshub.widget.WidgetSync.schedule(this)
        // Familie: deling i bakgrunnen og helsesammendraget fortsetter etter omstart av appen.
        runCatching { no.kristo.finanshub.family.FamilyService.sync(this) }
        if (no.kristo.finanshub.family.FamilyPrefs.health(this).isNotEmpty()) runCatching { no.kristo.finanshub.family.HealthSync.schedule(this) }
        from86 = intent
        if (fresh85) intent?.data?.let(::openData43)
        // Prompt 51 (ANDPLAT51): dynamisk snarvei (siste vare) og offline-køen sendes når nettet er tilbake.
        runCatching { Shortcuts51.publish(this) }
        if (Offline51.count(this) > 0) Offline51.schedule(this)
    }

    /** Prompt 43: magnet:-lenker går til Media; alt annet som før. */
    /** Prompt 86: intentet lenken kom med. Uten appens egen markør (Link86) kom den utenfra – da må lenker som utfører en handling, bekreftes først. */
    private var from86: Intent? = null
    private fun openData43(u: Uri) { if (u.scheme == "magnet") vm.openMagnet43(u.toString()) else vm.deepLink(u, outside86 = !Link86.internal(this, from86)) }

    override fun onResume() {
        super.onResume()
        if (vm.locked) unlock()
    }

    override fun onStop() {
        super.onStop()
        vm.onBackground()
        // Endringer i appen (bokført kvittering, ny pakke) vises i widgetene.
        if (vm.loggedIn) no.kristo.finanshub.widget.WidgetSync.refresh(this)
        // «Også i bakgrunnen» av (Helse og posisjon): posisjonen deles bare mens appen er åpen.
        if (!no.kristo.finanshub.family.FamilyPrefs.background(this)) runCatching { stopService(Intent(this, no.kristo.finanshub.family.FamilyService::class.java)) }
    }

    override fun onStart() {
        super.onStart()
        vm.onForeground()
        if (!no.kristo.finanshub.family.FamilyPrefs.background(this)) runCatching { no.kristo.finanshub.family.FamilyService.sync(this) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
        from86 = intent
        intent.data?.let(::openData43)
    }

    /** «Skjul beløp i appveksleren»: blankt bilde i oversikten over åpne apper. */
    private fun applySwitcherPrivacy() {
        val on = vm.prefs.bool(AppPrefs.HIDE_SWITCHER)
        if (Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(!on)
        else if (on) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE) else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }

    /** Lås opp med fingeravtrykk/ansikt, eller PIN/mønster som reserve. */
    fun unlock() {
        if (prompting) return
        val auth = BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        // Uten skjermlås på telefonen finnes det ingenting å låse med.
        if (BiometricManager.from(this).canAuthenticate(auth) != BiometricManager.BIOMETRIC_SUCCESS) { vm.locked = false; return }
        prompting = true
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder().setTitle("Lås opp Homelab").setSubtitle(vm.displayName.ifBlank { "Homelab" }).setAllowedAuthenticators(auth).build(),
        )
    }

    // «Del → FinansHub» fra Galleri eller Filer.
    private fun handleShare(intent: Intent?) {
        if (!vm.loggedIn) return
        when (intent?.action) {
            // Prompt 29: tekst (SMS, e-post) → «Legg til time» i Kalender.
            Intent.ACTION_SEND -> if (intent.type?.startsWith("text/") == true && intent.getStringExtra(Intent.EXTRA_TEXT) != null) {
                val sub = intent.getStringExtra(Intent.EXTRA_SUBJECT)?.takeIf { it.isNotBlank() }
                val txt = intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
                // Prompt 87: en NRK-lenke (Del → Homelab fra NRK-appen eller nettleseren) åpner Media → NRK med lenken i feltet.
                // Bare utfylling: ingenting lastes ned før brukeren selv trykker «Last ned» (regelen fra prompt 86).
                val nrk = nrkDelt87(txt)
                if (nrk != null) vm.shareNrk87(nrk)
                else vm.shareText29(if (sub != null && !txt.contains(sub)) "$sub\n$txt" else txt)
            } else {
                val uri: Uri? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
                // Prompt 50: deling mens Chat er åpen legger filen ved i chatten i stedet for i Finans-køen.
                uri?.let { if (vm.chat27.open) vm.addChat50(listOf(it)) else vm.uploadUri(it) }
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                val uris: List<Uri>? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else @Suppress("DEPRECATION") intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
                uris?.let { if (vm.chat27.open) vm.addChat50(it) else vm.uploadUris(it) }
            }
        }
    }
}

/** Prompt 85: true når intentet er nytt – ikke en gjenskapt aktivitet (lagret tilstand) og ikke hentet fra Nylige. */
internal fun freshLaunch85(restored: Boolean, flags: Int): Boolean =
    !restored && (flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0

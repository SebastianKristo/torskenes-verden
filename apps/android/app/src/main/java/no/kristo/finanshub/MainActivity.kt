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
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        applySwitcherPrivacy()
        handleShare(intent)
        prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { prompting = false; vm.locked = false }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) { prompting = false }
        })
        setContent {
            // Brettbare: bredde ≥ 600 dp (Medium/Expanded) gir navigasjonsrail og to paneler.
            val size = calculateWindowSizeClass(this)
            // Farger og lys/mørk fra Innstillinger → Utseende (Material You når «Følg systemet»).
            FinansTheme(vm.option(AppPrefs.COLOR, "system"), vm.option(AppPrefs.MODE, "dark")) {
                FinansApp(vm, size.widthSizeClass, unlock = ::unlock, onPrivacyChanged = ::applySwitcherPrivacy)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (vm.locked) unlock()
    }

    override fun onStop() { super.onStop(); vm.onBackground() }

    override fun onStart() {
        super.onStart()
        vm.onForeground()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
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
            BiometricPrompt.PromptInfo.Builder().setTitle("Lås opp FinansHub").setSubtitle(vm.displayName.ifBlank { "FinansHub" }).setAllowedAuthenticators(auth).build(),
        )
    }

    // «Del → FinansHub» fra Galleri eller Filer.
    private fun handleShare(intent: Intent?) {
        if (!vm.loggedIn) return
        when (intent?.action) {
            Intent.ACTION_SEND -> {
                val uri: Uri? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
                uri?.let { vm.uploadUri(it) }
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                val uris: List<Uri>? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else @Suppress("DEPRECATION") intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
                uris?.let { vm.uploadUris(it) }
            }
        }
    }
}

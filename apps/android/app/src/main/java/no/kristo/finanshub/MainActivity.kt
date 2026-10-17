package no.kristo.finanshub

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import no.kristo.finanshub.ui.FinansApp
import no.kristo.finanshub.ui.FinansTheme

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels()

    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleShare(intent)
        setContent {
            // Brettbare: bredde ≥ 600 dp (Medium/Expanded) gir navigasjonsrail og to paneler.
            val size = calculateWindowSizeClass(this)
            FinansTheme { FinansApp(vm, size.widthSizeClass) }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
    }

    // «Del → FinansHub» fra Galleri eller Filer.
    private fun handleShare(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND || !vm.loggedIn) return
        val uri: Uri? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
        uri?.let { vm.uploadUri(it) }
    }
}

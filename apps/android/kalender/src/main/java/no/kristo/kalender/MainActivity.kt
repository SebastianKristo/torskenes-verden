package no.kristo.kalender

import android.Manifest
import android.app.Application
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import no.kristo.kalender.ui.KalRoot
import no.kristo.kalender.widget.KalSync

/** Prompt 33: Kalender-appen. Én aktivitet (singleTask): lenker, deling og snarveier kommer inn her. */
class KalApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        KalNotify.channels(this)
        KalTheme.apply(this, KalPrefs.theme(this))
    }
}

class MainActivity : ComponentActivity() {
    private val vm: KalVm by viewModels()
    private val askNotif = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        Hap.attach(window.decorView)
        setContent { KalRoot(vm, onBackToHomelab = ::backToHomelab) }
        handle(intent)
        // Første gang: «Logg inn med Homelab-appen» automatisk hvis Homelab er installert og innlogget.
        if (vm.session == null) vm.loginHomelab(auto = true)
        KalSync.schedule(this)
        if (Build.VERSION.SDK_INT >= 33 && !KalNotify.canPost(this) && !KalPrefs.asked(this, "notif")) {
            KalPrefs.setAsked(this, "notif")
            runCatching { askNotif.launch(Manifest.permission.POST_NOTIFICATIONS) }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    override fun onStart() {
        super.onStart()
        vm.foreground = true
        vm.refresh()
        // Prompt 41: lokal/ekstern adresse fra Homelab (Bytt automatisk).
        if (vm.session != null) vm.k41.syncServers()
    }

    override fun onStop() {
        super.onStop()
        vm.foreground = false
        // Endringer i appen vises i widgetene, og varslene planlegges på nytt.
        KalSync.refreshNow(this)
    }

    /** Åpnet fra Homelab-appen (lenken har ?src=homelab, eller Homelab er avsenderen). */
    private fun fromHomelab(): Boolean = runCatching { referrer?.host == KalAuth.HOMELAB_PKG }.getOrDefault(false)

    private fun handle(i: Intent?) {
        i ?: return
        when (i.action) {
            Intent.ACTION_SEND -> {
                val sub = i.getStringExtra(Intent.EXTRA_SUBJECT)?.takeIf { it.isNotBlank() }
                val txt = i.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
                vm.incomingText(if (sub != null && !txt.contains(sub)) "$sub\n$txt" else txt)
            }
            Intent.ACTION_VIEW -> i.data?.let { vm.applyLink(it, fromHomelab()) }
            else -> if (fromHomelab()) vm.back = true
        }
    }

    /** «◀ Homelab»: tilbake til Homelab-appen der man var (oppgaven hentes frem), og Kalender legges bak. */
    private fun backToHomelab() {
        Hap.tick()
        val i = packageManager.getLaunchIntentForPackage(KalAuth.HOMELAB_PKG)
            ?: Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://"))
        runCatching { startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        vm.back = false
        moveTaskToBack(true)
    }
}

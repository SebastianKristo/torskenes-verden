package no.kristo.finanshub.ui

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext

/*
 * Prompt 43 (claude-code-fold-delt-hjem-fiks.md): hvilket oppsett Hjem (og de andre sidene) skal ha på store skjermer.
 *
 * Den egentlige feilen: Fold41 valgte «stående» ut fra boksen innholdet ligger i, ikke ut fra vinduet. Den boksen er
 * 112 dp smalere enn vinduet (plass til sidelinja) og 23 dp høyere (underNav34 legger innholdet opp under kanten).
 * På Galaxy Z Fold utbrettet (ca. 832 × 750 dp) ble boksen ca. 720 × 773 dp, altså «høyere enn bred», så Hjem ble
 * stablet: Glimt-kortet fikk 46 % av høyden, Brief-kortet ble klemt til en stripe og søkefeltet falt utenfor.
 *
 * Nå velges oppsettet av vinduet (LocalConfiguration, oppdateres med en gang ved bretting fordi aktiviteten håndterer
 * screenSize/screenLayout selv):
 *  - SPLIT: bredde ≥ 600 dp og bredde ≥ 0,9 × høyde (utbrettet, iPad/nettbrett liggende og stående nesten kvadratisk).
 *  - TABLETOP: halvbrettet (hengselvinkel 30–160°) med hengselen vannrett (vinduet høyere enn bredt) → øvre/nedre halvdel.
 *  - STACK: alt annet (sammenbrettet, dekselskjerm, smal portrett, Split View under 600) → vanlig mobiloppsett.
 * Hengselen leses fra plattformsensoren TYPE_HINGE_ANGLE (API 30+), uten nye avhengigheter (ikke androidx.window).
 */
internal enum class FoldMode43 { SPLIT, TABLETOP, STACK }

/** Oppsettet for vinduet nå. [wide] er WindowWidthSizeClass ≠ Compact (≥ 600 dp) fra MainActivity. */
@Composable
internal fun foldMode43(wide: Boolean): FoldMode43 {
    val cfg = LocalConfiguration.current
    val w = cfg.screenWidthDp
    val h = cfg.screenHeightDp
    val half = hingeHalfOpen43()
    return foldModeFor43(wide, w, h, half)
}

/** Ren regel (testbar): se kommentaren øverst. */
internal fun foldModeFor43(wide: Boolean, widthDp: Int, heightDp: Int, halfOpen: Boolean): FoldMode43 = when {
    !wide -> FoldMode43.STACK
    halfOpen && heightDp > widthDp -> FoldMode43.TABLETOP
    widthDp >= 600 && widthDp >= heightDp * 0.9f -> FoldMode43.SPLIT
    else -> FoldMode43.STACK
}

/** true når telefonen står halvbrettet (hengselvinkel mellom 30° og 160°). Uten hengselsensor: alltid false. */
@Composable
internal fun hingeHalfOpen43(): Boolean {
    val ctx = LocalContext.current
    var half by remember { mutableStateOf(false) }
    DisposableEffect(ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return@DisposableEffect onDispose { }
        val sm = ctx.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val sensor = sm?.getDefaultSensor(Sensor.TYPE_HINGE_ANGLE)
        if (sm == null || sensor == null) return@DisposableEffect onDispose { }
        val l = object : SensorEventListener {
            override fun onSensorChanged(e: SensorEvent) {
                val a = e.values.firstOrNull() ?: return
                half = a in 30f..160f
            }
            override fun onAccuracyChanged(s: Sensor?, accuracy: Int) {}
        }
        sm.registerListener(l, sensor, SensorManager.SENSOR_DELAY_NORMAL)
        onDispose { sm.unregisterListener(l) }
    }
    return half
}

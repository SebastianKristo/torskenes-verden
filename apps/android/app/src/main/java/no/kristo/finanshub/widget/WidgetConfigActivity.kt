package no.kristo.finanshub.widget

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch

/**
 * «Rediger widget» for Samsung/One UI-widgetene: «Vis navn under widget» (standard på), lagret per widget.
 * Åpnes fra hjemskjermen (android:configure + reconfigurable), ikke når widgeten legges til (configuration_optional).
 */
class WidgetConfigActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID) ?: AppWidgetManager.INVALID_APPWIDGET_ID
        setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }
        val start = WidgetStore.label(this, id)
        // Prompt 24: Samsung-widgetene i Samsung-størrelse har ikke navn under seg, men kan bruke Papir-farger.
        val s24 = runCatching { AppWidgetManager.getInstance(this).getAppWidgetInfo(id).provider.className.let { it.contains(".S24") || it.contains(".S27") } }.getOrDefault(false)
        val papir0 = S24.papir(this, id)
        setContent {
            var on by remember { mutableStateOf(start) }
            var papir by remember { mutableStateOf(papir0) }
            MaterialTheme(colorScheme = darkColorScheme(primary = Color(0xFF3E91FF))) {
                Surface(Modifier.fillMaxSize(), color = Color(0xFF121214)) {
                    Column(Modifier.fillMaxSize().systemBarsPadding().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        Text("Rediger widget", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.SemiBold)
                        if (s24) Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Color(0xFF1E1E22)).clickable { papir = !papir }.padding(18.dp, 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text("Papir-farger", color = Color.White, fontSize = 16.sp)
                                Text("Rød og hvit som i appen. Av: farger fra One UI-temaet", color = Color(0xFFB4B4BC), fontSize = 13.sp)
                            }
                            Switch(papir, { papir = it })
                        }
                        if (!s24) Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Color(0xFF1E1E22)).clickable { on = !on }.padding(18.dp, 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text("Vis navn under widget", color = Color.White, fontSize = 16.sp)
                                Text("Som Samsungs egne widgets", color = Color(0xFFB4B4BC), fontSize = 13.sp)
                            }
                            Switch(on, { on = it })
                        }
                        Spacer(Modifier.weight(1f))
                        Button(onClick = { if (s24) S24.setPapir(this@WidgetConfigActivity, id, papir); save(id, on) }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp)) { Text("Ferdig", fontSize = 16.sp) }
                    }
                }
            }
        }
    }

    private fun save(id: Int, on: Boolean) {
        WidgetStore.setLabel(this, id, on)
        MainScope().launch {
            // Tegn widgeten på nytt (økten følger også WidgetStore.labels når den kjører).
            runCatching {
                val info = AppWidgetManager.getInstance(this@WidgetConfigActivity).getAppWidgetInfo(id)
                val receiver = Class.forName(info.provider.className).getDeclaredConstructor().newInstance() as GlanceAppWidgetReceiver
                val gid = GlanceAppWidgetManager(this@WidgetConfigActivity).getGlanceIdBy(id)
                receiver.glanceAppWidget.update(this@WidgetConfigActivity, gid)
            }
            setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
            finish()
        }
    }
}

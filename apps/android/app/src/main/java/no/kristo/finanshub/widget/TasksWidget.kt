package no.kristo.finanshub.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import kotlinx.coroutines.flow.MutableStateFlow
import no.kristo.finanshub.MainActivity
import no.kristo.finanshub.family.FamilyPrefs
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/*
 * Huskeliste-widget (Glance, Material You-farger): de neste oppgavene med avkrysning rett i widgeten,
 * og + som åpner appen med feltet for ny oppgave klart (finanshub://huske/new).
 */

data class WTask(val id: String, val title: String, val due: String?, val list: String?)

/** Siste oppgaveliste for widgeten (lagres så widgeten har noe å vise uten nett). */
object TasksStore {
    val items = MutableStateFlow<List<WTask>?>(null)
    private fun sp(ctx: Context) = ctx.getSharedPreferences("tasks_widget", Context.MODE_PRIVATE)

    fun current(ctx: Context): List<WTask> = items.value ?: parse(sp(ctx).getString("json", null)).also { items.value = it }

    fun save(ctx: Context, raw: String) {
        sp(ctx).edit().putString("json", raw).apply()
        items.value = parse(raw)
    }

    /** Brukerskille (prompt 21): ny konto eller utlogging tømmer oppgavene i widgeten. */
    fun useAccount(ctx: Context, acct: String?) {
        val p = sp(ctx)
        if (acct != null && p.getString("acct", null) == acct) return
        p.edit().remove("json").apply { if (acct != null) putString("acct", acct) else remove("acct") }.apply()
        items.value = emptyList()
    }

    fun markDone(ctx: Context, id: String) {
        val l = current(ctx).filter { it.id != id }
        items.value = l
    }

    fun parse(raw: String?): List<WTask> {
        if (raw.isNullOrBlank()) return emptyList()
        val o = runCatching { JSONObject(raw) }.getOrNull()
        val a = o?.optJSONArray("items") ?: runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        return (0 until a.length()).mapNotNull { i ->
            val t = a.optJSONObject(i) ?: return@mapNotNull null
            if (t.optBoolean("done", false)) return@mapNotNull null
            WTask(t.optString("id").ifBlank { return@mapNotNull null }, t.optString("title"), t.optString("due").takeIf { it.isNotBlank() && it != "null" }?.take(10), t.optString("list").takeIf { it.isNotBlank() })
        }
    }
}

object TasksWidgetSync {
    /** Henter de neste oppgavene og tegner widgeten på nytt (kalles fra appen, sanntid og WidgetWorker). */
    fun refresh(ctx: Context) {
        val app = ctx.applicationContext
        Thread {
            runCatching {
                val api = FamilyPrefs.api(app) ?: return@runCatching
                val raw = kotlinx.coroutines.runBlocking { api.hlGet("/tasks/next?n=6", timeout = 8_000) }
                TasksStore.save(app, raw)
            }
            runCatching { kotlinx.coroutines.runBlocking { redraw(app) } }
        }.start()
    }

    suspend fun redraw(ctx: Context) {
        val m = GlanceAppWidgetManager(ctx)
        val w = TasksWidget()
        m.getGlanceIds(TasksWidget::class.java).forEach { id -> runCatching { w.update(ctx, id) } }
    }
}

private val TASK_ID = ActionParameters.Key<String>("task_id")

/** Avkrysning i widgeten: vises med en gang, og serveren oppdateres. */
class ToggleTaskAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val id = parameters[TASK_ID] ?: return
        TasksStore.markDone(context, id)
        TasksWidget().update(context, glanceId)
        runCatching {
            val api = FamilyPrefs.api(context) ?: return@runCatching
            api.request("PATCH", "/tasks/" + java.net.URLEncoder.encode(id, "UTF-8"), JSONObject().put("done", true), prefix = no.kristo.finanshub.Api.HOMELAB)
            TasksStore.save(context, api.hlGet("/tasks/next?n=6", timeout = 8_000))
        }
        TasksWidget().update(context, glanceId)
    }
}

class TasksWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val first = TasksStore.current(context)
        provideContent {
            val items by TasksStore.items.collectAsState()
            GlanceTheme { TasksBody(context, items ?: first) }
        }
    }
}

@Composable
private fun TasksBody(ctx: Context, items: List<WTask>) {
    val c = GlanceTheme.colors
    val size = LocalSize.current
    val rows = if (size.height < 150.dp) 2 else if (size.height < 230.dp) 4 else 6
    val open = Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://huske"), ctx, MainActivity::class.java)
    val add = Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://huske/new"), ctx, MainActivity::class.java)
    val today = LocalDate.now().toString()
    Column(
        GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(24.dp).background(c.widgetBackground).padding(14.dp),
    ) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Gjøremål", modifier = GlanceModifier.defaultWeight().clickable(actionStartActivity(open)),
                style = TextStyle(color = c.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Bold))
            Box(GlanceModifier.size(30.dp).cornerRadius(15.dp).background(c.primary).clickable(actionStartActivity(add)), contentAlignment = Alignment.Center) {
                Text("+", style = TextStyle(color = c.onPrimary, fontSize = 18.sp, fontWeight = FontWeight.Bold))
            }
        }
        Spacer(GlanceModifier.height(6.dp))
        if (items.isEmpty()) {
            Text("Ingen oppgaver. Trykk + for å legge til.", modifier = GlanceModifier.clickable(actionStartActivity(open)), style = TextStyle(color = c.onSurfaceVariant, fontSize = 13.sp))
        } else items.take(rows).forEach { t ->
            Row(GlanceModifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    GlanceModifier.size(22.dp).cornerRadius(11.dp).background(c.outline)
                        .clickable(actionRunCallback<ToggleTaskAction>(actionParametersOf(TASK_ID to t.id))),
                    contentAlignment = Alignment.Center,
                ) { Box(GlanceModifier.size(18.dp).cornerRadius(9.dp).background(c.widgetBackground)) {} }
                Spacer(GlanceModifier.width(10.dp))
                Text(t.title, maxLines = 1, modifier = GlanceModifier.defaultWeight().clickable(actionStartActivity(open)), style = TextStyle(color = c.onSurface, fontSize = 14.sp))
                val d = when {
                    t.due == null -> null
                    t.due < today -> "Forfalt"
                    t.due == today -> "I dag"
                    t.due == LocalDate.now().plusDays(1).toString() -> "I morgen"
                    else -> null
                }
                if (d != null) Text(d, style = TextStyle(color = if (d == "Forfalt") c.error else c.onSurfaceVariant, fontSize = 11.sp))
            }
        }
    }
}

class TasksReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TasksWidget()
    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetSync.schedule(context)
        TasksWidgetSync.refresh(context)
    }
}

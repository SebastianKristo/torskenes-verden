package no.kristo.finanshub.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import no.kristo.finanshub.Hjemlys40Prefs
import no.kristo.finanshub.MainActivity
import no.kristo.finanshub.R
import no.kristo.finanshub.hlClock40
import no.kristo.finanshub.hlMinutes40

/*
 * Prompt 40 (ANDROID40): Hjemlys «Felles» – Hjem-widgeten «Start for meg» (fasit Hjemme trygt Varianter.dc.html).
 * Uten økt: ett trykk starter Hjemlys med Glimt-forslagets / rutens tid (finanshub://hjemlys/start). Med økt: tid igjen og
 * «Jeg er hjemme» (finanshub://hjemlys/home). Vanlige RemoteViews; tegnes på nytt når økta endres (Hjemlys40Prefs).
 */
object HjemlysWidget40 {
    private fun link(ctx: Context, path: String, code: Int): PendingIntent = PendingIntent.getActivity(ctx, code,
        Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://hjemlys$path"), ctx, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    fun views(ctx: Context): RemoteViews {
        val s = Hjemlys40Prefs.session(ctx)
        return RemoteViews(ctx.packageName, R.layout.hjemlys40_widget).apply {
            if (s == null) {
                setTextViewText(R.id.hl40_title, "Hjemlys")
                setTextViewText(R.id.hl40_sub, "Si fra til familien når du er hjemme")
                setTextViewText(R.id.hl40_btn, "Start for meg")
                setOnClickPendingIntent(R.id.hl40_btn, link(ctx, "/start", 7381))
            } else {
                val m = hlMinutes40(s.eta)
                val late = s.state == "late" || (m != null && m < 0)
                setTextViewText(R.id.hl40_title, if (late) "${s.lateMinutes?.takeIf { it > 0 } ?: -(m ?: 0)} min over" else m?.let { "$it min" } ?: "På vei")
                setTextViewText(R.id.hl40_sub, if (late) "Familien har fått beskjed" else "Hjemme ca. ${hlClock40(s.eta) ?: "–"}")
                setTextViewText(R.id.hl40_btn, if (late) "Alt OK" else "Jeg er hjemme")
                setOnClickPendingIntent(R.id.hl40_btn, link(ctx, if (late) "/ok" else "/home", 7382))
            }
            setOnClickPendingIntent(R.id.hl40_root, link(ctx, "", 7380))
        }
    }

    fun redraw(ctx: Context) {
        val m = AppWidgetManager.getInstance(ctx) ?: return
        val ids = runCatching { m.getAppWidgetIds(ComponentName(ctx, HjemlysStart40Receiver::class.java)) }.getOrNull() ?: return
        if (ids.isNotEmpty()) runCatching { m.updateAppWidget(ids, views(ctx)) }
    }
}

class HjemlysStart40Receiver : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        runCatching { appWidgetManager.updateAppWidget(appWidgetIds, HjemlysWidget40.views(context)) }
    }
}

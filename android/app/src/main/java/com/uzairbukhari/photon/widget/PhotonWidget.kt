package com.uzairbukhari.photon.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.uzairbukhari.photon.Graph
import com.uzairbukhari.photon.MainActivity
import com.uzairbukhari.photon.R
import com.uzairbukhari.photon.data.AppJson
import com.uzairbukhari.photon.data.SolarLatest
import com.uzairbukhari.photon.ui.freshnessLabel
import com.uzairbukhari.photon.ui.kilowatts
import com.uzairbukhari.photon.ui.parseInstant
import com.uzairbukhari.photon.work.Scheduler
import java.io.IOException

class PhotonWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        // Show something immediately, then let the worker fetch fresh readings.
        ids.forEach { manager.updateAppWidget(it, WidgetUpdater.views(context, null, "Opening…")) }
        Scheduler.runOnce(context)
    }
}

object WidgetUpdater {
    fun views(context: Context, latest: SolarLatest?, status: String): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_overview)
        fun kw(metric: String) = kilowatts(latest?.value(metric))
        views.setTextViewText(R.id.w_soc, latest?.value("battery_soc")?.let { "%.0f%%".format(it) } ?: "—")
        views.setTextViewText(R.id.w_solar, kw("solar_power"))
        views.setTextViewText(R.id.w_home, kw("home_power"))
        views.setTextViewText(R.id.w_grid, kw("grid_power"))
        views.setTextViewText(R.id.w_status, status)
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        views.setOnClickPendingIntent(R.id.widget_root, open)
        return views
    }

    suspend fun update(context: Context, graph: Graph) {
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, PhotonWidget::class.java))
        if (ids.isEmpty()) return
        val result = try {
            val got = graph.repository.read("/api/solar/latest?summary=1")
            val latest = AppJson.decodeFromString<SolarLatest>(got.body)
            val label = freshnessLabel(parseInstant(latest.updatedAt))
            latest to (if (got.fromCache) "Offline · $label" else label)
        } catch (_: IOException) {
            null to "Can't reach the server"
        } catch (_: Exception) {
            null to "No readings yet"
        }
        ids.forEach { manager.updateAppWidget(it, views(context, result.first, result.second)) }
    }
}

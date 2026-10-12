package com.uzairbukhari.photon.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.uzairbukhari.photon.PhotonApp
import com.uzairbukhari.photon.data.AlertFeed
import com.uzairbukhari.photon.data.AppJson
import com.uzairbukhari.photon.widget.WidgetUpdater
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Every 15 minutes: pick up new alerts and refresh the home-screen widget. */
class BackgroundWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val graph = (applicationContext as PhotonApp).graph
        if (!graph.session.signedIn.value) return Result.success()
        try {
            checkAlerts(graph.prefs, graph.api)
        } catch (_: IOException) {
            // Offline or the server is busy: try again at the next run.
        }
        WidgetUpdater.update(applicationContext, graph)
        return Result.success()
    }

    private suspend fun checkAlerts(prefs: com.uzairbukhari.photon.data.AppPrefs, api: com.uzairbukhari.photon.data.ApiClient) {
        val last = prefs.lastAlertId
        val feed = AppJson.decodeFromString<AlertFeed>(api.get("/api/mobile/alerts" + (last?.let { "?after=$it" } ?: "")))
        feed.alerts.forEach { Notifications.show(applicationContext, it) }
        prefs.lastAlertId = maxOf(feed.latest, last ?: 0)
    }
}

object Scheduler {
    private const val PERIODIC = "photon-background"
    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun start(context: Context) {
        val request = PeriodicWorkRequestBuilder<BackgroundWorker>(15, TimeUnit.MINUTES).setConstraints(online).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    fun stop(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
    }

    /** Runs the same job once, right now (used when a widget is added). */
    fun runOnce(context: Context) {
        WorkManager.getInstance(context).enqueue(OneTimeWorkRequestBuilder<BackgroundWorker>().setConstraints(online).build())
    }
}

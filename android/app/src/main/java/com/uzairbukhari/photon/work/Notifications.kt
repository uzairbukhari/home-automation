package com.uzairbukhari.photon.work

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.uzairbukhari.photon.MainActivity
import com.uzairbukhari.photon.R
import com.uzairbukhari.photon.data.AlertItem

object Notifications {
    const val CHANNEL = "alerts"

    fun createChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "Home alerts", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Low battery, offline devices and other alerts you turned on"
            },
        )
    }

    fun canPost(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun show(context: Context, alert: AlertItem) {
        if (!canPost(context)) return
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_photon)
            .setContentTitle(alert.title.ifBlank { "Photon" })
            .setContentText(alert.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(alert.body))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(alert.id.toInt(), notification)
    }
}

package com.uzairbukhari.photon.data

import kotlinx.serialization.Serializable

@Serializable
data class AlertItem(val id: Long, val title: String = "", val body: String = "", val url: String = "")

/** GET /api/mobile/alerts */
@Serializable
data class AlertFeed(val alerts: List<AlertItem> = emptyList(), val latest: Long = 0)

/** GET /app/version.json, written by the deploy workflow next to the APK. */
@Serializable
data class VersionInfo(val versionCode: Int, val versionName: String = "", val apk: String = "/app/photon.apk")

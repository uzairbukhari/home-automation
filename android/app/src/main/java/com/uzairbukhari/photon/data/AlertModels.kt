package com.uzairbukhari.photon.data

import kotlinx.serialization.Serializable

@Serializable
data class AlertItem(val id: Long, val title: String = "", val body: String = "", val url: String = "")

/** GET /api/mobile/alerts */
@Serializable
data class AlertFeed(val alerts: List<AlertItem> = emptyList(), val latest: Long = 0)

/** version.json attached to the latest GitHub release. */
@Serializable
data class VersionInfo(val versionCode: Int, val versionName: String = "", val apk: String = "")

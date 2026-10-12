package com.uzairbukhari.photon.update

import com.uzairbukhari.photon.BuildConfig
import com.uzairbukhari.photon.data.ApiClient
import com.uzairbukhari.photon.data.AppJson
import com.uzairbukhari.photon.data.VersionInfo
import java.io.IOException

/** Looks for a newer APK published next to the website. */
class UpdateChecker(private val api: ApiClient, private val serverUrl: () -> String?) {
    /** The newer version if one exists, otherwise null (also null when the check fails). */
    suspend fun newer(current: Int = BuildConfig.VERSION_CODE): VersionInfo? = try {
        AppJson.decodeFromString<VersionInfo>(api.getPublic("/app/version.json")).takeIf { isNewer(it.versionCode, current) }
    } catch (_: IOException) {
        null
    } catch (_: Exception) {
        null
    }

    fun apkUrl(info: VersionInfo): String? = serverUrl()?.let { it + info.apk }

    companion object {
        fun isNewer(available: Int, current: Int) = available > current
    }
}

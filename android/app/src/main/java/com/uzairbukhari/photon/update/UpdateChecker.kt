package com.uzairbukhari.photon.update

import com.uzairbukhari.photon.BuildConfig
import com.uzairbukhari.photon.data.ApiClient
import com.uzairbukhari.photon.data.AppJson
import com.uzairbukhari.photon.data.VersionInfo
import java.io.IOException

/** Looks for a newer APK published as the latest GitHub Release. */
class UpdateChecker(private val api: ApiClient) {
    /** The newer version if one exists, otherwise null (also null when the check fails). */
    suspend fun newer(current: Int = BuildConfig.VERSION_CODE): VersionInfo? = try {
        AppJson.decodeFromString<VersionInfo>(api.getAbsolute("$RELEASES/version.json")).takeIf { isNewer(it.versionCode, current) }
    } catch (_: IOException) {
        null
    } catch (_: Exception) {
        null
    }

    fun apkUrl(info: VersionInfo): String = apkUrlFor(info)

    companion object {
        const val RELEASES = "https://github.com/uzairbukhari/home-automation/releases/latest/download"

        fun isNewer(available: Int, current: Int) = available > current

        /** The APK address from version.json when it is an absolute https URL, otherwise the latest release's photon.apk. */
        fun apkUrlFor(info: VersionInfo): String = if (info.apk.startsWith("https://")) info.apk else "$RELEASES/photon.apk"
    }
}
